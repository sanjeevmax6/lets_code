'use client';
import { useEffect, useRef } from 'react';
import {
  EditorView,
  lineNumbers,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  drawSelection,
} from '@codemirror/view';
import { EditorState } from '@codemirror/state';
import { python } from '@codemirror/lang-python';
import { javascript } from '@codemirror/lang-javascript';
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
} from '@codemirror/commands';
import {
  indentOnInput,
  bracketMatching,
  indentUnit,
} from '@codemirror/language';
import { oneDark } from '@codemirror/theme-one-dark';
import type { Language } from '@/lib/problem';
export default function CodeEditor({
  value,
  language,
  onChange,
}: {
  value: string;
  language: Language;
  onChange: (v: string) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const change = useRef(onChange);
  useEffect(() => {
    change.current = onChange;
  }, [onChange]);
  useEffect(() => {
    if (!host.current) return;
    const editor = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: '',
        extensions: [
          lineNumbers(),
          highlightActiveLine(),
          highlightActiveLineGutter(),
          drawSelection(),
          history(),
          indentOnInput(),
          bracketMatching(),
          indentUnit.of('    '),
          keymap.of([indentWithTab, ...defaultKeymap, ...historyKeymap]),
          language === 'python' ? python() : javascript(),
          oneDark,
          EditorView.contentAttributes.of({
            'aria-label': 'Solution code',
            spellcheck: 'false',
            autocorrect: 'off',
            autocapitalize: 'off',
          }),
          EditorView.theme({
            '&': { height: '100%', fontSize: '14px', background: '#1c1f23' },
            '.cm-scroller': {
              overflow: 'auto',
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
            },
            '.cm-content': { padding: '18px 0' },
            '.cm-gutters': { background: '#1c1f23', border: 'none' },
            '.cm-line': { padding: '0 16px' },
            '.cm-focused': { outline: 'none' },
          }),
          EditorView.updateListener.of((u) => {
            if (u.docChanged) change.current(u.state.doc.toString());
          }),
        ],
      }),
    });
    view.current = editor;
    return () => {
      editor.destroy();
      view.current = null;
    };
  }, [language]);
  useEffect(() => {
    const e = view.current;
    if (e && e.state.doc.toString() !== value)
      e.dispatch({
        changes: { from: 0, to: e.state.doc.length, insert: value },
      });
  }, [value, language]);
  return <div className="editor-host" ref={host} />;
}
