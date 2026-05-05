import { useRef, useEffect, useImperativeHandle, forwardRef } from 'react';
import Editor, {
  ControlType,
  EditorMode,
  PageMode,
  PaperDirection,
  RowFlex,
  KeyMap,
} from '@hufe921/canvas-editor';
import type {
  IEditorData,
  IEditorOption,
  IEditorResult,
  IElement,
} from '@hufe921/canvas-editor';

const defaultOptions: Partial<IEditorOption> = {
  mode: EditorMode.EDIT,
  pageMode: PageMode.PAGING,
  paperDirection: PaperDirection.VERTICAL,
  defaultFont: '仿宋_GB2312, FangSong_GB2312, 仿宋, FangSong, sans-serif',
  defaultSize: 14,
  defaultColor: '#000000',
  defaultBasicRowMarginHeight: 7,
  defaultRowMargin: 4,
  margins: [1260, 1260, 1260, 1260], // [top, right, bottom, left] ~20mm
};

export interface CanvasEditorHandle {
  getResult: () => IEditorResult | null;
  setData: (data: IEditorData, options?: Partial<IEditorOption>) => void;
  setControlValues: (values: Record<string, string>) => void;
  getControlValues: () => Record<string, string>;
}

interface CanvasEditorWrapperProps {
  initialData?: IEditorData;
  initialOptions?: Partial<IEditorOption>;
  onChange?: (data: IEditorData) => void;
  height?: number;
}

// 定义插入槽位的 control 配置
function makeSlotControl(conceptId: string): IElement {
  return {
    value: '',
    type: undefined,
    controlId: conceptId,
    controlComponent: undefined,
    control: {
      type: ControlType.TEXT,
      value: null,
      conceptId,
      placeholder: conceptId,
      minWidth: 60,
      border: true,
    },
  };
}

const CanvasEditorWrapper = forwardRef<CanvasEditorHandle, CanvasEditorWrapperProps>(
  ({ initialData, initialOptions, onChange, height = 700 }, ref) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const editorRef = useRef<Editor | null>(null);
    const isReadyRef = useRef(false);

    useEffect(() => {
      if (!containerRef.current) return;

      const container = containerRef.current;
      let editor: Editor | null = null;
      let raf = 0;
      let readyTimer: ReturnType<typeof setTimeout>;

      const defaultGuideData: IEditorData = {
        header: [],
        main: [
          { value: '' },
          { value: '请在此编辑呈批表模版', size: 18, bold: true, rowFlex: RowFlex.CENTER },
          { value: '' },
          { value: '1. 按 Ctrl+Shift+M 在光标位置插入数据槽位（如标题、来文单位等）' },
          { value: '2. 也可以从 WPS/Word 粘贴表格和文字' },
          { value: '3. 编辑完成后点「保存模版」' },
        ],
        footer: [],
      };

      raf = requestAnimationFrame(() => {
        const data = initialData || defaultGuideData;
        const options = { ...defaultOptions, ...initialOptions };

        editor = new Editor(container, data, options);
        editorRef.current = editor;

        const onContentChange = () => {
          if (isReadyRef.current && editor) {
            const result = editor.command.getValue();
            onChange?.(result.data);
          }
        };

        editor.register.shortcutList([
          {
            key: KeyMap.M,
            ctrl: true,
            shift: true,
            callback: (command) => {
              const conceptId = prompt('请输入数据字段名（如：部门）：');
              if (conceptId && /^[\w一-龥]+$/.test(conceptId)) {
                command.executeInsertElementList([makeSlotControl(conceptId)]);
              }
            },
          },
        ]);

        editor.eventBus.on('contentChange', onContentChange);
        editor.eventBus.on('controlChange', onContentChange);
        editor.eventBus.on('controlContentChange', onContentChange);

        readyTimer = setTimeout(() => {
          isReadyRef.current = true;
        }, 300);
      });

      return () => {
        cancelAnimationFrame(raf);
        clearTimeout(readyTimer!);
        if (editor) {
          editor.destroy();
          editorRef.current = null;
        }
      };
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    useImperativeHandle(ref, () => ({
      getResult: () => {
        return editorRef.current?.command.getValue() ?? null;
      },
      setData: (data: IEditorData, options?: Partial<IEditorOption>) => {
        editorRef.current?.command.executeSetValue(data);
        if (options) {
          editorRef.current?.command.executeUpdateOptions(options);
        }
      },
      setControlValues: (values: Record<string, string>) => {
        const editor = editorRef.current;
        if (!editor) return;
        const payloads: Array<{ conceptId: string; value: IElement[]; isSubmitHistory?: boolean }> = [];
        for (const [conceptId, value] of Object.entries(values)) {
          payloads.push({ conceptId, value: [{ value }] });
        }
        editor.command.executeSetControlValueList(payloads as any);
      },
      getControlValues: () => {
        const editor = editorRef.current;
        if (!editor) return {};
        const result: Record<string, string> = {};
        try {
          const controls = editor.command.getControlValue({});
          if (controls) {
            for (const c of controls) {
              if (c.conceptId) {
                result[c.conceptId] = c.value || c.innerText || '';
              }
            }
          }
        } catch { /* ignore */ }
        return result;
      },
    }), []);

    return (
      <div
        ref={containerRef}
        style={{
          width: '100%',
          height,
          background: '#e8e8e8',
          borderRadius: 8,
          overflow: 'auto',
        }}
      />
    );
  },
);

CanvasEditorWrapper.displayName = 'CanvasEditorWrapper';

export default CanvasEditorWrapper;
