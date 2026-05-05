import { useRef, useEffect, useCallback } from 'react';
import { Editor } from '@tinymce/tinymce-react';

// 自托管 TinyMCE，离线可用
import 'tinymce/tinymce';
import 'tinymce/themes/silver';
import 'tinymce/models/dom';
import 'tinymce/icons/default';
import 'tinymce/plugins/table';
import 'tinymce/plugins/lists';
import 'tinymce/plugins/fullscreen';

import type { Editor as TinyMCEEditor } from 'tinymce';

const slotCss = `
  .data-slot {
    background: #e6f4ff !important;
    border: 1.5px dashed #1677ff !important;
    border-radius: 3px !important;
    padding: 0 4px !important;
    cursor: pointer !important;
    user-select: all !important;
    white-space: nowrap !important;
    font-style: normal !important;
    position: relative !important;
  }
  .data-slot::after {
    content: ' ⚡';
    font-size: 0.7em;
    opacity: 0.5;
  }
  @keyframes slot-detect-pulse {
    0% { transform: scale(1); box-shadow: 0 0 0 0 rgba(22,119,255,0.5); }
    50% { transform: scale(1.08); box-shadow: 0 0 0 6px rgba(22,119,255,0); }
    100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(22,119,255,0); }
  }
  .slot-detected {
    animation: slot-detect-pulse 0.6s ease-out;
  }
`;

interface ApprovalTemplateEditorProps {
  value: string;
  onChange: (html: string) => void;
  height?: number;
}

// 检测并标记粘贴内容中的 [xxx] 数据槽位
function processSlots(editor: TinyMCEEditor) {
  const body = editor.getBody();
  const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT);

  const textNodes: Text[] = [];
  let node: Text | null;
  while ((node = walker.nextNode() as Text | null)) {
    if (
      node.parentElement?.closest('.data-slot') ||
      node.parentElement?.closest('.mceNonEditable')
    ) {
      continue;
    }
    textNodes.push(node);
  }

  const replacements: { textNode: Text; before: string; span: HTMLSpanElement; after: string }[] = [];
  // 匹配 [中文] 或 [abc123] 但不匹配 [[ 双括号
  const regex = /(?<!\[)\[([一-龥\w]+)\](?!\])/g;

  for (const textNode of textNodes) {
    const text = textNode.textContent || '';
    regex.lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(text)) !== null) {
      const key = match[1];
      const idx = match.index;
      const span = document.createElement('span');
      span.className = 'data-slot slot-detected';
      span.setAttribute('data-slot-key', key);
      span.setAttribute('contenteditable', 'false');
      span.textContent = `【${key}】`;

      replacements.push({
        textNode,
        before: text.slice(0, idx),
        span,
        after: text.slice(idx + match[0].length),
      });
    }
  }

  // 从后往前替换，避免 offset 偏移
  for (let i = replacements.length - 1; i >= 0; i--) {
    const { textNode, before, span, after } = replacements[i];
    const parent = textNode.parentNode!;
    if (before) parent.insertBefore(document.createTextNode(before), textNode);
    parent.insertBefore(span, textNode);
    if (after) parent.insertBefore(document.createTextNode(after), textNode);
    parent.removeChild(textNode);

    // 500ms 后移除动画 class
    setTimeout(() => span.classList.remove('slot-detected'), 600);
  }
}

// 导出时：将槽位恢复为可替换的 {{key}} 占位符
export function editorHTMLToTemplate(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll('[data-slot-key]').forEach((slot) => {
    const key = slot.getAttribute('data-slot-key')!;
    slot.replaceWith(doc.createTextNode(`{{${key}}}`));
  });
  return doc.body.innerHTML;
}

// 填充数据：将 {{key}} 替换为实际值
export function fillTemplate(html: string, data: Record<string, string>): string {
  return html.replace(/\{\{(.+?)\}\}/g, (_, key: string) => {
    return data[key.trim()] || '';
  });
}

// 编辑器中的高亮槽位（兼容旧数据）
function highlightExistingSlots(editor: TinyMCEEditor) {
  const body = editor.getBody();
  body.querySelectorAll('.data-slot').forEach((slot) => {
    const el = slot as HTMLElement;
    el.setAttribute('contenteditable', 'false');
    if (!el.style.background) el.style.background = '#e6f4ff';
    if (!el.style.border) el.style.border = '1.5px dashed #1677ff';
  });
}

export default function ApprovalTemplateEditor({
  value,
  onChange,
  height = 800,
}: ApprovalTemplateEditorProps) {
  const editorRef = useRef<TinyMCEEditor | null>(null);
  const initRef = useRef(false);

  const handleInit = useCallback((_evt: any, editor: TinyMCEEditor) => {
    editorRef.current = editor;

    // 粘贴后处理
    editor.on('paste', () => {
      setTimeout(() => processSlots(editor), 50);
    });

    // setContent 后高亮已有槽位
    editor.on('SetContent', () => {
      setTimeout(() => highlightExistingSlots(editor), 50);
    });

    // 初始内容加载后高亮
    setTimeout(() => highlightExistingSlots(editor), 100);
  }, []);

  // 确保 value 更新时同步（仅在未激活编辑时）
  useEffect(() => {
    if (initRef.current && editorRef.current) {
      const ed = editorRef.current;
      const current = ed.getContent();
      if (current !== value && !ed.hasFocus()) {
        ed.setContent(value);
        setTimeout(() => highlightExistingSlots(ed), 50);
      }
    }
  }, [value]);

  return (
    <div style={{ background: '#e8e8e8', borderRadius: 8, overflow: 'auto' }}>
      <style>{slotCss}</style>
      <Editor
        licenseKey="gpl"
        onInit={handleInit}
        initialValue={value}
        onEditorChange={(html) => {
          initRef.current = true;
          onChange(html);
        }}
        init={{
          height,
          width: '100%',
          menubar: false,
          skin_url: '/tinymce-skins/ui/oxide',
          content_css: false,
          language: 'zh_CN',
          plugins: [
            'table', 'lists', 'fullscreen',
          ],
          toolbar:
            'undo redo | bold italic underline | ' +
            'alignleft aligncenter alignright | ' +
            'bullist numlist | table | ' +
            'removeformat | fullscreen',
          paste_data_images: true,
          paste_enable_default_filters: false,
          paste_retain_style_properties: 'all',
          paste_webkit_styles: 'all',
          paste_word_valid_elements: '*[*]',
          valid_elements: '*[*]',
          extended_valid_elements: '*[*]',
          invalid_elements: '',
          schema: 'html5',
          table_default_attributes: { border: '1' },
          table_default_styles: {
            'border-collapse': 'collapse',
          },
          content_style: `
            html { background: #e8e8e8; }
            body {
              width: 210mm;
              min-height: 297mm;
              margin: 24px auto;
              padding: 20mm 20mm 25mm 25mm;
              background: #fff;
              box-shadow: 0 2px 12px rgba(0,0,0,0.18);
              font-family: 仿宋_GB2312, FangSong_GB2312, 仿宋, FangSong, sans-serif;
              font-size: 14pt;
              line-height: 2;
              overflow-wrap: break-word;
              word-wrap: break-word;
            }
            p { margin: 0; }
            table { margin: 0 auto; border-collapse: collapse; }
            table td, table th { padding: 3pt 5pt; }
            [contenteditable="false"] { cursor: default; }
            [contenteditable="true"] { cursor: text; }
            img { max-width: 100%; }
            ${slotCss}
          `,
          paste_postprocess: (_plugin, args) => {
            const node = args.node as HTMLElement;
            // 将 Word mso-line-height-rule:exactly 的行高转为标准 line-height
            node.querySelectorAll('[style*="mso-line-height-rule"]').forEach((el) => {
              const htmlEl = el as HTMLElement;
              htmlEl.style.removeProperty('mso-line-height-rule');
              htmlEl.style.removeProperty('mso-line-height-alt');
            });
            // 移除段落间的 mso 间距
            node.querySelectorAll('[style*="mso-para-margin"]').forEach((el) => {
              (el as HTMLElement).style.removeProperty('mso-para-margin');
            });
            // Word 表格居中：将 align="center" 或 mso 对齐转为 margin: 0 auto
            node.querySelectorAll('table').forEach((el) => {
              const table = el as HTMLElement;
              const align = table.getAttribute('align');
              if (align === 'center') {
                table.removeAttribute('align');
                table.style.marginLeft = 'auto';
                table.style.marginRight = 'auto';
              }
              // 清理 Word 表格相关的 mso 私有样式
              table.style.removeProperty('mso-table-anchor-vertical');
              table.style.removeProperty('mso-table-anchor-horizontal');
              table.style.removeProperty('mso-table-left');
              table.style.removeProperty('mso-table-top');
              table.style.removeProperty('mso-table-lspace');
              table.style.removeProperty('mso-table-rspace');
            });
          },
          setup: (editor) => {
            // 注册快捷键 Ctrl+Shift+M 插入槽位
            editor.addShortcut('ctrl+shift+m', '插入数据槽位', () => {
              const key = prompt('请输入数据字段名（如：部门）：');
              if (key && /^[一-龥\w]+$/.test(key)) {
                const span = editor.getDoc().createElement('span');
                span.className = 'data-slot';
                span.setAttribute('data-slot-key', key);
                span.setAttribute('contenteditable', 'false');
                span.textContent = `【${key}】`;
                editor.insertContent(span.outerHTML);
              }
            });
          },
        }}
      />
    </div>
  );
}
