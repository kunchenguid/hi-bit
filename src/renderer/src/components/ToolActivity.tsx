import type { ToolActivity as ToolActivityModel } from "@shared/chat";

type ToolActivityProps = {
  tools: ToolActivityModel[];
};

export function ToolActivity({ tools }: ToolActivityProps) {
  if (tools.length === 0) return null;
  return (
    <section className="hb-tool-panel" aria-label="Build activity">
      <h2>What Bit is building</h2>
      <div className="hb-tool-list">
        {tools.map((tool) => (
          <details className="hb-tool-row" key={tool.callId}>
            <summary>
              <span>
                {tool.projectTitle ? `${tool.projectTitle}: ${tool.toolName}` : tool.toolName}
              </span>
              <span className={`hb-tool-status hb-tool-status-${tool.status}`}>{tool.status}</span>
            </summary>
            {tool.args !== undefined ? <pre>{JSON.stringify(tool.args, null, 2)}</pre> : null}
            {tool.content.map((content) =>
              content.type === "text" ? (
                <pre key={toolContentKey(tool.callId, content.text)}>{content.text}</pre>
              ) : (
                <p className="t-small" key={toolContentKey(tool.callId, content.data)}>
                  Image output: {content.mimeType}
                </p>
              ),
            )}
          </details>
        ))}
      </div>
    </section>
  );
}

function toolContentKey(callId: string, value: string): string {
  return `${callId}-${value.slice(0, 40)}`;
}
