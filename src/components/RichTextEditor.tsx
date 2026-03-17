import ReactQuill from "react-quill-new";
import "react-quill-new/dist/quill.snow.css";
import { cn } from "@/lib/utils";
import { useMemo } from "react";

interface RichTextEditorProps {
  content: string;
  onChange: (html: string) => void;
  placeholder?: string;
  className?: string;
}

const modules = {
  toolbar: [
    [{ header: [2, 3, false] }],
    ["bold", "italic", "underline"],
    [{ list: "ordered" }, { list: "bullet" }],
    ["blockquote", "link"],
    ["clean"],
  ],
};

const formats = [
  "header",
  "bold",
  "italic",
  "underline",
  "list",
  "blockquote",
  "link",
];

export function RichTextEditor({ content, onChange, placeholder, className }: RichTextEditorProps) {
  // Memoize modules to prevent re-renders
  const quillModules = useMemo(() => modules, []);

  return (
    <div className={cn("rich-text-editor", className)}>
      <ReactQuill
        theme="snow"
        value={content}
        onChange={onChange}
        modules={quillModules}
        formats={formats}
        placeholder={placeholder}
      />
    </div>
  );
}
