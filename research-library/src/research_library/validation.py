from pathlib import Path
import jsonschema
from .core import digest, read_json


def validate_schema(name, value):
    schema = read_json(Path(__file__).parent / 'schemas' / f'{name}.schema.json')
    jsonschema.Draft202012Validator(schema, format_checker=jsonschema.FormatChecker()).validate(value)


def validate_evidence(library, item, evidence):
    versions = {v['id']: v for v in item['content_versions']}
    version = versions.get(evidence['version_id'])
    if not version or not version['text_path']:
        raise ValueError('Evidence does not reference an extracted content version')
    text = library.path(version['text_path']).read_text(encoding='utf-8')
    if digest(text) != version['text_sha256']:
        raise ValueError('Extracted text checksum mismatch')
    start, end = evidence['start'], evidence['end']
    if start < 0 or end <= start or text[start:end] != evidence['quote']:
        raise ValueError('Evidence quote does not match source offsets')
    if evidence['prefix'] and not text[:start].endswith(evidence['prefix']):
        raise ValueError('Evidence prefix mismatch')
    if evidence['suffix'] and not text[end:].startswith(evidence['suffix']):
        raise ValueError('Evidence suffix mismatch')
    if evidence['page'] is not None:
        pages = read_json(library.path(version['pages_path'])) if version['pages_path'] else []
        if not any(p['page'] == evidence['page'] and p['start'] <= start and end <= p['end'] for p in pages):
            raise ValueError('Evidence does not fall within the cited PDF page')


def validate_item(library, item):
    validate_schema('item', item)
    for version in item['content_versions']:
        for key in ['original_path', 'text_path', 'pages_path']:
            if version[key] and not library.path(version[key]).is_file():
                raise ValueError(f'Missing content file: {version[key]}')
    for event_id in item['capture_events']:
        if not library.path(f'inbox/events/{event_id}.json').exists():
            raise ValueError('Missing capture event')
    if item['analysis']['status'] == 'complete':
        if item['retrieval']['coverage'] in {'none', 'link_only'}:
            raise ValueError('Cannot analyze unread content')
        if not item['analysis']['summary'] or not item['analysis']['highlights'] or not item['analysis']['provenance']:
            raise ValueError('Complete analysis requires a summary, evidence highlights, and provenance')
        hashes = {v['text_sha256'] for v in item['content_versions'] if v['text_sha256']}
        provided = set(item['analysis']['provenance']['input_hashes'])
        if not provided or not provided.issubset(hashes):
            raise ValueError('Analysis input hashes do not match captured text')
    for field in ['highlights', 'claims']:
        for entry in item['analysis'][field]:
            validate_evidence(library, item, entry['evidence'])
    for entity_id in item['analysis']['topic_ids'] + item['analysis']['entity_ids']:
        path = library.path(f'records/entities/{entity_id}.json')
        entity = read_json(path)
        validate_schema('entity', entity)
        if entity['id'] != entity_id:
            raise ValueError('Entity ID mismatch')
