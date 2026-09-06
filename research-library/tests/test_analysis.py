import json
import pytest
from research_library.core import Library, read_json, write_json
from research_library.ingest import ingest_event
from research_library.extract import run_extraction
from research_library.analysis import prepare, evidence, submit, add_entity
from research_library.views import rebuild, search, brief


def analyzed(tmp_path):
    library = Library(tmp_path)
    library.init()
    item_id = ingest_event(library, {'source':'test','source_id':'1','text':'Batteries store energy. Measurements show a capacity of ten units.'})[0]
    run_extraction(library)
    path = prepare(library)[0]
    packet = read_json(path)
    packet['analysis'].update(status='complete', summary='A note reports measured battery capacity.', highlights=[{'text':'The measured capacity is ten units.','evidence':evidence(library,item_id,'Measurements show a capacity of ten units.')}])
    packet['analysis']['provenance']['agent'] = 'test-agent'
    entity = add_entity(library,'Batteries')
    packet['analysis']['topic_ids'] = [entity['id']]
    write_json(path,packet)
    submit(library,path)
    return library,item_id,path


def test_evidence_validation_and_no_overwrite(tmp_path):
    library,item_id,path = analyzed(tmp_path)
    packet = read_json(path)
    packet['analysis']['highlights'][0]['evidence']['quote'] = 'Invented claim'
    write_json(path,packet)
    with pytest.raises(ValueError,match='quote'): submit(library,path)
    assert library.item(item_id)['analysis']['highlights'][0]['text'] == 'The measured capacity is ten units.'


def test_rebuild_search_links_and_personal_notes(tmp_path):
    library,item_id,path = analyzed(tmp_path)
    personal = library.path('vault/Personal/notes.md')
    personal.write_text('My interpretation')
    output = rebuild(library)
    assert output == {'sources':1,'nodes':2,'edges':1}
    assert search(library,'capacity')[0]['id'] == item_id
    assert search(library,'Batteries')[0]['id'] == item_id
    note = library.path(f'vault/Sources/{item_id}.md').read_text()
    assert '../Raw/' in note and '[[Topics/entity_' in note
    library.path('derived/search.sqlite').unlink()
    rebuild(library)
    assert personal.read_text() == 'My interpretation'
    assert search(library,'units')[0]['id'] == item_id


def test_brief_watermark_does_not_skip_late_analysis(tmp_path):
    library,item_id,path = analyzed(tmp_path)
    first = brief(library)
    assert '1 new or updated analyses' in open(first).read()
    second = brief(library)
    assert '0 new or updated analyses' in open(second).read()
    packet = read_json(path)
    packet['analysis']['summary'] = 'An updated interpretation of measured battery capacity.'
    write_json(path,packet)
    submit(library,path)
    third = brief(library)
    assert '1 new or updated analyses' in open(third).read()


def test_prepare_preserves_agent_work(tmp_path):
    library = Library(tmp_path); library.init()
    ingest_event(library, {'source':'test','source_id':'1','text':'A source note'})
    run_extraction(library)
    path = prepare(library)[0]
    before = open(path).read()
    assert prepare(library)[0] == path and open(path).read() == before
