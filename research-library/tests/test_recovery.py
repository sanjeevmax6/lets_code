import json
from pathlib import Path
import subprocess
import sys
import pytest
from research_library.core import Library, read_json, write_json
from research_library.ingest import ingest_event
from research_library.extract import run_extraction
from research_library.validation import validate_schema
from research_library.analysis import add_relationship, evidence


def test_schema_copies_are_identical():
    root=Path(__file__).resolve().parents[1]
    for path in (root/'schemas').glob('*.json'):
        assert read_json(path)==read_json(root/'src/research_library/schemas'/path.name)


def test_recovery_after_event_and_record_checkpoint_interrupt(tmp_path):
    library=Library(tmp_path);library.init()
    item_id=ingest_event(library,{'source':'test','source_id':'event','text':'Persistent original text.'})[0]
    run_extraction(library)
    library.item_path(item_id).unlink()
    library.job(item_id,'published')  # Simulate a partial restoration with stale operational state.
    result=subprocess.run([sys.executable,'-m','research_library.cli','--root',str(tmp_path),'recover'],capture_output=True,text=True)
    assert result.returncode==0,result.stderr
    with library.db() as db:
        assert db.execute('SELECT stage FROM jobs WHERE item_id=?',(item_id,)).fetchone()['stage']=='captured'
    assert run_extraction(library)['extracted']==[item_id]


def test_relationship_path_traversal_rejected():
    with pytest.raises(Exception):
        validate_schema('entity',{'schema_version':'1.0.0','id':'../../vault/Personal/notes','name':'evil','kind':'topic','aliases':[]})


def test_claim_relationship_requires_both_sources(tmp_path):
    library=Library(tmp_path);library.init()
    a=ingest_event(library,{'source':'test','source_id':'a','text':'The experiment measured five units.'})[0]
    b=ingest_event(library,{'source':'test','source_id':'b','text':'A replication also measured five units.'})[0]
    run_extraction(library)
    relation={'schema_version':'1.0.0','id':'relation_test','source_id':a,'target_id':b,'type':'supports','basis':'inferred','rationale':'Both measured five units.','evidence':[{'item_id':a,'locator':evidence(library,a,'measured five units.')}]}
    path=tmp_path/'staging/relation.json';write_json(path,relation)
    with pytest.raises(ValueError,match='both'):add_relationship(library,path)
    relation['evidence'].append({'item_id':b,'locator':evidence(library,b,'measured five units.')})
    write_json(path,relation)
    assert add_relationship(library,path)=='relation_test'
