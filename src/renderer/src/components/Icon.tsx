import type { SVGProps } from "react";

export type IconName =
  | "i-home"
  | "i-book"
  | "i-chat"
  | "i-code"
  | "i-trophy"
  | "i-star"
  | "i-flame"
  | "i-play"
  | "i-pause"
  | "i-settings"
  | "i-check"
  | "i-close"
  | "i-hint"
  | "i-heart"
  | "i-user"
  | "i-swap"
  | "i-folder"
  | "i-download"
  | "i-arrow-left";

type IconProps = Omit<SVGProps<SVGSVGElement>, "children"> & {
  name: IconName;
};

export function PixelIconSprite() {
  return (
    <svg
      className="hb-icon-sprite"
      xmlns="http://www.w3.org/2000/svg"
      style={{ display: "none" }}
      aria-hidden="true"
      focusable="false"
    >
      <symbol id="i-home" viewBox="0 0 16 16">
        <g fill="currentColor" shapeRendering="crispEdges">
          <rect x="7" y="2" width="2" height="1" />
          <rect x="6" y="3" width="4" height="1" />
          <rect x="5" y="4" width="6" height="1" />
          <rect x="4" y="5" width="8" height="1" />
          <rect x="3" y="6" width="10" height="1" />
          <rect x="4" y="7" width="8" height="7" />
          <rect x="7" y="10" width="2" height="4" />
        </g>
      </symbol>
      <symbol id="i-book" viewBox="0 0 16 16">
        <g fill="currentColor" shapeRendering="crispEdges">
          <rect x="3" y="3" width="10" height="10" />
          <rect x="8" y="4" width="0" height="0" />
          <rect x="5" y="5" width="6" height="1" fill="#F7F1E5" />
          <rect x="5" y="7" width="6" height="1" fill="#F7F1E5" />
          <rect x="5" y="9" width="4" height="1" fill="#F7F1E5" />
          <rect x="7" y="3" width="2" height="10" fill="#F7F1E5" />
        </g>
      </symbol>
      <symbol id="i-chat" viewBox="0 0 16 16">
        <g fill="currentColor" shapeRendering="crispEdges">
          <rect x="2" y="3" width="12" height="8" />
          <rect x="3" y="2" width="10" height="1" />
          <rect x="3" y="11" width="10" height="1" />
          <rect x="4" y="12" width="2" height="1" />
          <rect x="5" y="13" width="1" height="1" />
          <rect x="5" y="6" width="2" height="2" fill="#F7F1E5" />
          <rect x="9" y="6" width="2" height="2" fill="#F7F1E5" />
        </g>
      </symbol>
      <symbol id="i-code" viewBox="0 0 16 16">
        <g fill="currentColor" shapeRendering="crispEdges">
          <rect x="5" y="4" width="1" height="1" />
          <rect x="4" y="5" width="1" height="1" />
          <rect x="3" y="6" width="1" height="1" />
          <rect x="2" y="7" width="1" height="2" />
          <rect x="3" y="9" width="1" height="1" />
          <rect x="4" y="10" width="1" height="1" />
          <rect x="5" y="11" width="1" height="1" />
          <rect x="10" y="4" width="1" height="1" />
          <rect x="11" y="5" width="1" height="1" />
          <rect x="12" y="6" width="1" height="1" />
          <rect x="13" y="7" width="1" height="2" />
          <rect x="12" y="9" width="1" height="1" />
          <rect x="11" y="10" width="1" height="1" />
          <rect x="10" y="11" width="1" height="1" />
          <rect x="8" y="4" width="1" height="1" />
          <rect x="7" y="5" width="1" height="1" />
          <rect x="7" y="6" width="1" height="1" />
          <rect x="6" y="7" width="1" height="1" />
          <rect x="6" y="8" width="1" height="1" />
          <rect x="5" y="9" width="1" height="1" />
          <rect x="5" y="10" width="1" height="1" />
        </g>
      </symbol>
      <symbol id="i-trophy" viewBox="0 0 16 16">
        <g fill="currentColor" shapeRendering="crispEdges">
          <rect x="3" y="3" width="10" height="1" />
          <rect x="3" y="4" width="2" height="4" />
          <rect x="11" y="4" width="2" height="4" />
          <rect x="5" y="4" width="6" height="5" />
          <rect x="6" y="9" width="4" height="2" />
          <rect x="4" y="11" width="8" height="1" />
          <rect x="5" y="12" width="6" height="1" />
          <rect x="2" y="5" width="1" height="2" />
          <rect x="13" y="5" width="1" height="2" />
        </g>
      </symbol>
      <symbol id="i-star" viewBox="0 0 16 16">
        <g fill="currentColor" shapeRendering="crispEdges">
          <rect x="7" y="2" width="2" height="2" />
          <rect x="6" y="4" width="4" height="2" />
          <rect x="2" y="6" width="12" height="2" />
          <rect x="3" y="8" width="10" height="1" />
          <rect x="4" y="9" width="3" height="2" />
          <rect x="9" y="9" width="3" height="2" />
          <rect x="3" y="11" width="2" height="2" />
          <rect x="11" y="11" width="2" height="2" />
        </g>
      </symbol>
      <symbol id="i-flame" viewBox="0 0 16 16">
        <g fill="currentColor" shapeRendering="crispEdges">
          <rect x="7" y="2" width="2" height="2" />
          <rect x="6" y="4" width="3" height="2" />
          <rect x="5" y="5" width="6" height="3" />
          <rect x="4" y="7" width="8" height="4" />
          <rect x="3" y="9" width="10" height="3" />
          <rect x="4" y="12" width="8" height="2" />
          <rect x="5" y="14" width="6" height="1" />
        </g>
      </symbol>
      <symbol id="i-play" viewBox="0 0 16 16">
        <g fill="currentColor" shapeRendering="crispEdges">
          <rect x="4" y="3" width="2" height="10" />
          <rect x="6" y="4" width="2" height="8" />
          <rect x="8" y="5" width="2" height="6" />
          <rect x="10" y="6" width="2" height="4" />
          <rect x="12" y="7" width="1" height="2" />
        </g>
      </symbol>
      <symbol id="i-pause" viewBox="0 0 16 16">
        <g fill="currentColor" shapeRendering="crispEdges">
          <rect x="4" y="3" width="3" height="10" />
          <rect x="9" y="3" width="3" height="10" />
        </g>
      </symbol>
      <symbol id="i-settings" viewBox="0 0 16 16">
        <g fill="currentColor" shapeRendering="crispEdges">
          <rect x="7" y="1" width="2" height="2" />
          <rect x="7" y="13" width="2" height="2" />
          <rect x="1" y="7" width="2" height="2" />
          <rect x="13" y="7" width="2" height="2" />
          <rect x="3" y="3" width="2" height="2" />
          <rect x="11" y="3" width="2" height="2" />
          <rect x="3" y="11" width="2" height="2" />
          <rect x="11" y="11" width="2" height="2" />
          <rect x="5" y="5" width="6" height="6" />
          <rect x="7" y="7" width="2" height="2" fill="#F7F1E5" />
        </g>
      </symbol>
      <symbol id="i-check" viewBox="0 0 16 16">
        <g fill="currentColor" shapeRendering="crispEdges">
          <rect x="11" y="3" width="2" height="2" />
          <rect x="9" y="5" width="2" height="2" />
          <rect x="7" y="7" width="2" height="2" />
          <rect x="5" y="9" width="2" height="2" />
          <rect x="3" y="7" width="2" height="2" />
          <rect x="5" y="9" width="2" height="2" />
        </g>
      </symbol>
      <symbol id="i-close" viewBox="0 0 16 16">
        <g fill="currentColor" shapeRendering="crispEdges">
          <rect x="3" y="3" width="2" height="2" />
          <rect x="5" y="5" width="2" height="2" />
          <rect x="7" y="7" width="2" height="2" />
          <rect x="9" y="9" width="2" height="2" />
          <rect x="11" y="11" width="2" height="2" />
          <rect x="11" y="3" width="2" height="2" />
          <rect x="9" y="5" width="2" height="2" />
          <rect x="5" y="9" width="2" height="2" />
          <rect x="3" y="11" width="2" height="2" />
        </g>
      </symbol>
      <symbol id="i-hint" viewBox="0 0 16 16">
        <g fill="currentColor" shapeRendering="crispEdges">
          <rect x="6" y="2" width="4" height="1" />
          <rect x="4" y="3" width="8" height="1" />
          <rect x="3" y="4" width="10" height="5" />
          <rect x="4" y="9" width="8" height="1" />
          <rect x="5" y="10" width="6" height="2" />
          <rect x="6" y="12" width="4" height="1" />
          <rect x="6" y="13" width="4" height="1" />
          <rect x="7" y="14" width="2" height="1" />
        </g>
      </symbol>
      <symbol id="i-heart" viewBox="0 0 16 16">
        <g fill="currentColor" shapeRendering="crispEdges">
          <rect x="3" y="3" width="4" height="1" />
          <rect x="9" y="3" width="4" height="1" />
          <rect x="2" y="4" width="5" height="2" />
          <rect x="9" y="4" width="5" height="2" />
          <rect x="2" y="6" width="12" height="3" />
          <rect x="3" y="9" width="10" height="1" />
          <rect x="4" y="10" width="8" height="1" />
          <rect x="5" y="11" width="6" height="1" />
          <rect x="6" y="12" width="4" height="1" />
          <rect x="7" y="13" width="2" height="1" />
        </g>
      </symbol>
      <symbol id="i-user" viewBox="0 0 16 16">
        <g fill="currentColor" shapeRendering="crispEdges">
          <rect x="6" y="2" width="4" height="1" />
          <rect x="5" y="3" width="6" height="4" />
          <rect x="6" y="7" width="4" height="1" />
          <rect x="4" y="9" width="8" height="1" />
          <rect x="3" y="10" width="10" height="4" />
          <rect x="5" y="12" width="6" height="1" fill="#F7F1E5" />
        </g>
      </symbol>
      <symbol id="i-swap" viewBox="0 0 16 16">
        <g fill="currentColor" shapeRendering="crispEdges">
          <rect x="3" y="4" width="8" height="2" />
          <rect x="10" y="2" width="2" height="2" />
          <rect x="12" y="4" width="2" height="2" />
          <rect x="10" y="6" width="2" height="2" />
          <rect x="5" y="10" width="8" height="2" />
          <rect x="4" y="8" width="2" height="2" />
          <rect x="2" y="10" width="2" height="2" />
          <rect x="4" y="12" width="2" height="2" />
        </g>
      </symbol>
      <symbol id="i-folder" viewBox="0 0 16 16">
        <g fill="currentColor" shapeRendering="crispEdges">
          <rect x="2" y="4" width="5" height="1" />
          <rect x="2" y="5" width="7" height="1" />
          <rect x="2" y="6" width="12" height="8" />
          <rect x="3" y="8" width="10" height="1" fill="#F7F1E5" />
        </g>
      </symbol>
      <symbol id="i-download" viewBox="0 0 16 16">
        <g fill="currentColor" shapeRendering="crispEdges">
          <rect x="7" y="2" width="2" height="6" />
          <rect x="5" y="6" width="6" height="2" />
          <rect x="6" y="8" width="4" height="2" />
          <rect x="7" y="10" width="2" height="1" />
          <rect x="3" y="11" width="2" height="3" />
          <rect x="11" y="11" width="2" height="3" />
          <rect x="5" y="13" width="6" height="1" />
        </g>
      </symbol>
      <symbol id="i-arrow-left" viewBox="0 0 16 16">
        <g fill="currentColor" shapeRendering="crispEdges">
          <rect x="6" y="3" width="2" height="2" />
          <rect x="4" y="5" width="2" height="2" />
          <rect x="2" y="7" width="2" height="2" />
          <rect x="4" y="9" width="2" height="2" />
          <rect x="6" y="11" width="2" height="2" />
          <rect x="3" y="7" width="11" height="2" />
        </g>
      </symbol>
    </svg>
  );
}

export function Icon({ name, className, ...props }: IconProps) {
  return (
    <svg
      {...props}
      className={["hb-icon", className].filter(Boolean).join(" ")}
      aria-hidden="true"
      focusable="false"
    >
      <use href={`#${name}`} />
    </svg>
  );
}
