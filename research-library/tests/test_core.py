import pytest
from research_library.core import Library, canonical_url, write_json, read_json


def test_canonical_preserves_meaningful_query():
    assert canonical_url('https://EXAMPLE.com/p?id=7&utm_source=x#top') == 'https://example.com/p?id=7'
    assert canonical_url('https://twitter.com/u/status/1') == 'https://x.com/u/status/1'
    with pytest.raises(ValueError): canonical_url('file:///etc/passwd')


def test_paths_and_atomic_records(tmp_path):
    library = Library(tmp_path)
    library.init()
    with pytest.raises(ValueError): library.path('../secret')
    write_json(tmp_path/'staging/a.json', {'a': 1})
    assert read_json(tmp_path/'staging/a.json') == {'a': 1}
    library.job('item_1', 'queued')
    library.job('item_1', 'failed', 'timeout', attempted=True)
    with library.db() as db:
        row = db.execute('SELECT * FROM jobs').fetchone()
        assert row['attempts'] == 1 and row['stage'] == 'failed'
