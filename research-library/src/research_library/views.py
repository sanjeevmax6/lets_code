from __future__ import annotations
from collections import defaultdict
import datetime as dt
import json
import os
from pathlib import Path
import re
import sqlite3
import subprocess
from urllib.parse import quote
from .core import atomic_write, digest, now, read_json, write_json
from .validation import validate_item, validate_schema, validate_relationship


def safe_text(value):
    return str(value).replace('<', '&lt;').replace('>', '&gt;').replace('[', '\\[').replace(']', '\\]')


def rebuild(library):
    items = library.items()
    entities = {e['id']:e for e in (read_json(p) for p in (library.root/'records/entities').glob('*.json'))}
    relationships = [read_json(p) for p in (library.root/'records/relationships').glob('*.json')]
    for item in items:
        validate_item(library, item)
    for relation in relationships:
        validate_relationship(library, relation)
    index = library.root/'derived/search.next.sqlite'
    if index.exists():
        index.unlink()
    db = sqlite3.connect(index)
    try:
        db.execute('CREATE VIRTUAL TABLE items USING fts5(id UNINDEXED, title, url, saved_at UNINDEXED, text, summary, topics, comments)')
        for item in items:
            text = '\n'.join(library.path(v['text_path']).read_text(encoding='utf-8') for v in item['content_versions'] if v['text_path'])
            comments = '\n'.join(read_json(library.path(f'inbox/events/{event}.json'))['text'] for event in item['capture_events'])
            topics = ' '.join(entities[e]['name'] for e in item['analysis']['topic_ids'] + item['analysis']['entity_ids'])
            db.execute('INSERT INTO items VALUES (?,?,?,?,?,?,?,?)', (item['id'], item['title'] or '', item['canonical_url'] or '', item['first_saved_at'], text, item['analysis']['summary'] or '', topics, comments))
        db.commit()
    finally:
        db.close()
    os.replace(index, library.root/'derived/search.sqlite')
    nodes, links, memberships = [], [], defaultdict(list)
    for entity_id, entity in entities.items():
        nodes.append({'id':entity_id,'label':entity['name'],'type':entity['kind'],'file_type':'markdown','source_file':f'vault/Topics/{entity_id}.md'})
    for item in items:
        item_id = item['id']
        title = item['title'] or item['original_url'] or item_id
        note = f'vault/Sources/{item_id}.md'
        nodes.append({'id':item_id,'label':title,'type':item['kind'],'file_type':'markdown','source_file':note, 'url':item['original_url']})
        front = {'id':item_id, 'title':title, 'saved':item['first_saved_at'], 'coverage':item['retrieval']['coverage'], 'analysis':item['analysis']['status']}
        lines = ['---'] + [f'{key}: {json.dumps(value, ensure_ascii=False)}' for key,value in front.items()] + ['---', '', f'# {safe_text(title)}', '', '> Generated note. Put personal annotations in ../Personal/.', '']
        if item['original_url']:
            lines += [f"[Open original](<{item['original_url']}>)", '']
        lines += [f"Coverage: **{item['retrieval']['coverage']}** · Analysis: **{item['analysis']['status']}**", '']
        if item['analysis']['summary']:
            lines += [safe_text(item['analysis']['summary']), '', '## Highlights', '']
        else:
            lines += ['Awaiting agent analysis. No summary has been inferred from the link.', '']
        versions = {v['id']:v for v in item['content_versions']}
        for highlight in item['analysis']['highlights']:
            ev = highlight['evidence']; version = versions[ev['version_id']]
            # Source notes live in vault/Sources, so raw evidence is one level up.
            target = '../' + quote(version['text_path'][len('vault/'):], safe='/')
            if ev['page'] and version['original_path']:
                target = '../' + quote(version['original_path'][len('vault/'):], safe='/') + f"#page={ev['page']}"
            lines += [f"- {safe_text(highlight['text'])} ([evidence]({target}))", f"  > {safe_text(ev['quote']).replace(chr(10), ' ')}", '']
        if item['analysis']['limitations']:
            lines += ['## Limitations', ''] + ['- ' + safe_text(x) for x in item['analysis']['limitations']] + ['']
        lines += ['## Related topics', '']
        for entity_id in sorted(set(item['analysis']['topic_ids'] + item['analysis']['entity_ids'])):
            memberships[entity_id].append(item)
            name = entities[entity_id]['name']
            lines.append(f'[[Topics/{entity_id}|{safe_text(name)}]]')
            links.append({'source':item_id,'target':entity_id,'key':'about','relation':'about','confidence':'INFERRED','rationale':'Agent-assigned topic; inspect source highlights','source_file':note})
        related = [r for r in relationships if item_id in {r['source_id'],r['target_id']}]
        if related:
            lines += ['', '## Connections', '']
            for relation in related:
                other = relation['target_id'] if relation['source_id'] == item_id else relation['source_id']
                folder = 'Topics' if other in entities else 'Sources'
                lines.append(f"- {relation['type']} [[{folder}/{other}]] — {safe_text(relation['rationale'])} ({relation['basis']})")
        lines += ['', '## Preserved source', '']
        for version in item['content_versions']:
            if version['original_path']:
                lines.append(f"- [Original file](../{quote(version['original_path'][len('vault/'):], safe='/')}) · SHA-256 `{version['sha256']}`")
        if item['retrieval']['error']:
            lines += ['', 'Capture issue: ' + safe_text(item['retrieval']['error'])]
        atomic_write(library.path(note), '\n'.join(lines) + '\n')
    for entity_id, entity in entities.items():
        lines = [f"# {safe_text(entity['name'])}", '', 'Sources connected by agent-assigned metadata:', '']
        lines += [f"- [[Sources/{i['id']}|{safe_text(i['title'] or i['original_url'] or i['id'])}]]" for i in memberships[entity_id]]
        atomic_write(library.path(f'vault/Topics/{entity_id}.md'), '\n'.join(lines)+'\n')
    for relation in relationships:
        links.append({'source':relation['source_id'],'target':relation['target_id'],'key':relation['id'],'relation':relation['type'],'confidence':relation['basis'].upper(),'rationale':relation['rationale'],'evidence':relation['evidence']})
    for link in links:
        link['original_source'] = link['source']
        link['original_target'] = link['target']
    graph = {'directed':False,'multigraph':True,'graph':{'schema_version':'1.0.0'},'nodes':nodes,'links':links}
    write_json(library.path('derived/graphify/graph.json'), graph)
    home = ['# Reading library', '', f'{len(items)} saved sources · {sum(i["analysis"]["status"] == "complete" for i in items)} analyzed', '', '## Sources', '']
    home += [f"- [[Sources/{i['id']}|{safe_text(i['title'] or i['original_url'] or i['id'])}]] — {i['retrieval']['coverage']}" for i in sorted(items, key=lambda i:i['first_saved_at'], reverse=True)]
    if not items:
        home += ['', 'Your library is ready for its first source.', '', 'Send reading to your selected WhatsApp chat, or ask your agent to import a URL, PDF, or chat export.', '', 'Then ask: **Run the pipeline, complete the staged analysis, and summarize my saved reading.**', '', 'Keep your own annotations in the Personal folder. Sources, Topics, and Briefs are generated from validated records.']
    home += ['', '## Briefs', ''] + [f'[[Briefs/{p.stem}]]' for p in sorted((library.root/'vault/Briefs').glob('*.md'), reverse=True)]
    atomic_write(library.path('vault/Start Here.md'), '\n'.join(home)+'\n')
    return {'sources':len(items),'nodes':len(nodes),'edges':len(links)}


def search(library, query, since=None, limit=20):
    path = library.root/'derived/search.sqlite'
    if not path.exists():
        rebuild(library)
    db = sqlite3.connect(f'file:{path}?mode=ro', uri=True)
    db.row_factory = sqlite3.Row
    try:
        # Literal terms, not user-provided FTS operators or SQL.
        terms = re.findall(r'\w+', query, re.UNICODE)
        if not terms:
            return []
        match = ' AND '.join('"'+t+'"' for t in terms)
        return [dict(r) for r in db.execute('SELECT id,title,url,saved_at,snippet(items,4,\'[\',\']\',\'…\',24) AS excerpt FROM items WHERE items MATCH ? AND saved_at>=? ORDER BY rank LIMIT ?', (match,since or '',limit))]
    finally:
        db.close()


def brief(library, since='last-brief'):
    stamp = now()
    checkpoint = library.path('state/brief.json')
    prior = read_json(checkpoint) if checkpoint.exists() else {'hashes':{}}
    items = library.items()
    def signature(i):
        return digest(json.dumps(i['analysis'],sort_keys=True))
    if since == 'last-brief':
        chosen = [i for i in items if i['analysis']['status']=='complete' and prior['hashes'].get(i['id']) != signature(i)]
    else:
        dt.datetime.fromisoformat(since.replace('Z','+00:00'))
        chosen = [i for i in items if i['first_saved_at'] >= since and i['analysis']['status']=='complete']
    pending = [i for i in items if i['analysis']['status'] != 'complete']
    lines = ['# Saved-reading brief', '', f'Generated {stamp}. This covers your saved library, not a survey of all current news.', '', f'{len(chosen)} new or updated analyses; {len(pending)} items still awaiting analysis or retrieval.', '']
    for item in chosen:
        lines += [f"## [[Sources/{item['id']}|{safe_text(item['title'] or item['original_url'] or item['id'])}]]", '', safe_text(item['analysis']['summary']), '']
        lines += ['- '+safe_text(h['text']) for h in item['analysis']['highlights'][:3]] + ['']
    if pending:
        lines += ['## Coverage gaps', ''] + [f"- [[Sources/{i['id']}]]: {i['retrieval']['status']}; {safe_text(i['retrieval']['error'] or 'awaiting analysis')}" for i in pending]
    path = library.path('vault/Briefs/' + stamp.replace(':','-') + '.md')
    atomic_write(path, '\n'.join(lines)+'\n')
    if since == 'last-brief':
        prior['hashes'].update({i['id']:signature(i) for i in chosen})
        write_json(checkpoint, prior)
    rebuild(library)
    return str(path)


def graphify(library, action='export', query=None):
    binary = library.root/'.tools/bin/graphify'
    if not binary.exists():
        raise ValueError('Graphify is not installed; run scripts/bootstrap.sh')
    graph = library.root/'derived/graphify/graph.json'
    if action == 'query':
        args = [str(binary),'query',query,'--graph',str(graph)]
    else:
        args = [str(binary),'export','html','--graph',str(graph)]
    result = subprocess.run(args, cwd=library.root, capture_output=True, text=True, timeout=120)
    atomic_write(library.path('derived/graphify/last-command.log'), result.stdout + result.stderr)
    if result.returncode:
        raise ValueError('Graphify command failed; see derived/graphify/last-command.log')
    return result.stdout.strip()
