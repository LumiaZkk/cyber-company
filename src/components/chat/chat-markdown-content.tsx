import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import remarkGfm from "remark-gfm";

type ChatMarkdownContentProps = {
  text: string;
  proseClassName: string;
};

export function ChatMarkdownContent({ text, proseClassName }: ChatMarkdownContentProps) {
  return (
    <div className={proseClassName}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
        {text}
      </ReactMarkdown>
    </div>
  );
}
