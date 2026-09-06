from copy import deepcopy
from .core import VERSION, digest, now, read_json, write_json
from .validation import validate_schema, validate_evidence, validate_relationship


def prepare(library, limit=25):
    jobs = []
    for item in library.items():
        if item['analysis']['status'] == 'complete' or item['retrieval']['status'] != 'extracted':
            continue
        version = item['content_versions'][-1]
        if not version['text_path']:
            continue
        packet = {'item_id':item['id'], 'record_path':str(library.item_path(item['id'])),
                  'text_path':str(library.path(version['text_path'])), 'version_id':version['id'],
                  'text_sha256':version['text_sha256'], 'pages_path':str(library.path(version['pages_path'])) if version['pages_path'] else None,
                  'metadata':{key:item[key] for key in ['title','authors','publisher','published_at','identifiers']},
                  'analysis':deepcopy(item['analysis'])}
        packet['analysis']['provenance'] = {'agent':'REPLACE_WITH_AGENT','model':None,'prompt_version':'1.0.0',
                  'run_id':'analysis_' + digest(now())[:16], 'input_hashes':[version['text_sha256']], 'generated_at':now()}
        path = library.path(f"staging/{item['id']}.json")
        # Never overwrite work in progress.
        if not path.exists():
            write_json(path, packet)
        jobs.append(str(path))
        if len(jobs) >= limit:
            break
    return jobs


def evidence(library, item_id, quote, occurrence=0):
    item = library.item(item_id)
    version = next((v for v in reversed(item['content_versions']) if v['text_path']), None)
    if not version:
        raise ValueError('No extracted text')
    text = library.path(version['text_path']).read_text(encoding='utf-8')
    start = -1
    if occurrence < 0 or not quote:
        raise ValueError('Quote must be nonempty and occurrence nonnegative')
    for _ in range(occurrence + 1):
        start = text.find(quote, start + 1)
        if start < 0:
            raise ValueError('Quote not found at the requested occurrence')
    end = start + len(quote)
    pages = read_json(library.path(version['pages_path'])) if version['pages_path'] else []
    page = next((p['page'] for p in pages if p['start'] <= start and end <= p['end']), None)
    return {'version_id':version['id'], 'quote':quote,'start':start,'end':end,'page':page,
            'prefix':text[max(0,start-40):start],'suffix':text[end:end+40]}


def submit(library, path):
    packet = read_json(path)
    item = library.item(packet['item_id'])
    latest = next((v for v in reversed(item['content_versions']) if v['text_sha256']), None)
    if not latest or packet['text_sha256'] != latest['text_sha256']:
        raise ValueError('Staged analysis is stale; prepare against the current content version')
    analysis = packet['analysis']
    if latest['text_sha256'] not in (analysis.get('provenance') or {}).get('input_hashes',[]):
        raise ValueError('Analysis provenance must include the current text hash')
    if analysis['status'] != 'complete':
        raise ValueError('Set analysis.status to complete before submitting')
    if analysis['provenance']['agent'] == 'REPLACE_WITH_AGENT':
        raise ValueError('Record the agent that produced this analysis')
    for relation_id in analysis['relationship_ids']:
        relation = read_json(library.path(f'records/relationships/{relation_id}.json'))
        if item['id'] not in {relation['source_id'], relation['target_id']}:
            raise ValueError('Relationship does not reference this item')
    candidate = deepcopy(item)
    candidate['analysis'] = analysis
    for key,value in packet.get('metadata',{}).items():
        if key not in {'title','authors','publisher','published_at','identifiers'}:
            raise ValueError('Unsupported metadata field')
        candidate[key] = value
    library.save(candidate)
    library.job(item['id'], 'published')
    return item['id']


def add_entity(library, name, kind='topic'):
    entity_id = 'entity_' + digest(kind + ':' + name.strip().casefold())[:24]
    path = library.path(f'records/entities/{entity_id}.json')
    if path.exists():
        return read_json(path)
    entity = {'schema_version':VERSION,'id':entity_id,'name':name.strip(),'kind':kind,'aliases':[]}
    validate_schema('entity', entity)
    write_json(path, entity)
    return entity


def add_relationship(library, path):
    relation = read_json(path)
    validate_relationship(library, relation)
    write_json(library.path(f"records/relationships/{relation['id']}.json"), relation)
    return relation['id']
