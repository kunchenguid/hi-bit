import { Fragment, type ReactNode } from "react";
import { type InlineNode, parseMarkdown } from "./markdown";

type MarkdownTextProps = {
  text: string;
};

export function MarkdownText({ text }: MarkdownTextProps) {
  const blocks = parseMarkdown(text);
  return (
    <>
      {blocks.map((block, blockIndex) => {
        if (block.type === "list") {
          return (
            // biome-ignore lint/suspicious/noArrayIndexKey: blocks are positional and static.
            <ul key={blockIndex} className="hb-message-list-md">
              {block.items.map((item, itemIndex) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: list items are positional.
                <li key={itemIndex}>{renderInline(item)}</li>
              ))}
            </ul>
          );
        }
        return (
          // biome-ignore lint/suspicious/noArrayIndexKey: blocks are positional and static.
          <p key={blockIndex}>
            {block.lines.map((line, lineIndex) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: lines are positional.
              <Fragment key={lineIndex}>
                {lineIndex > 0 ? <br /> : null}
                {renderInline(line)}
              </Fragment>
            ))}
          </p>
        );
      })}
    </>
  );
}

function renderInline(nodes: InlineNode[]): ReactNode[] {
  return nodes.map((node, index) => {
    switch (node.type) {
      case "strong":
        // biome-ignore lint/suspicious/noArrayIndexKey: inline nodes are positional.
        return <strong key={index}>{node.text}</strong>;
      case "em":
        // biome-ignore lint/suspicious/noArrayIndexKey: inline nodes are positional.
        return <em key={index}>{node.text}</em>;
      case "code":
        // biome-ignore lint/suspicious/noArrayIndexKey: inline nodes are positional.
        return <code key={index}>{node.text}</code>;
      default:
        // biome-ignore lint/suspicious/noArrayIndexKey: inline nodes are positional.
        return <Fragment key={index}>{node.text}</Fragment>;
    }
  });
}
