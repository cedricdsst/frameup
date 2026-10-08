"use client";

import {
  forwardRef,
  useEffect,
  useId,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";

export type ArtworkCard = {
  id: number;
  title: string;
  image?: string;
  loading?: boolean;
};

export type ArtworkImageTransform = {
  scale: number;
  x: number;
  y: number;
};

export const DEFAULT_IMAGE_TRANSFORM: ArtworkImageTransform = { scale: 1, x: 0, y: 0 };

type CoverArtworkProps = {
  background: string;
  title: string;
  titleImage?: string;
  titleLoading?: boolean;
  cards: ArtworkCard[];
  imageTransforms: Record<string, ArtworkImageTransform>;
  selectedImageId?: string;
  onSelectImage: (imageId: string) => void;
  onDeselect: () => void;
  onTransformImage: (imageId: string, transform: ArtworkImageTransform) => void;
  editingCardTitleId?: number;
  onEditCardTitle: (cardId: number) => void;
  onChangeCardTitle: (cardId: number, title: string) => void;
  onFinishCardTitle: () => void;
};

type Frame = { x: number; y: number; width: number; height: number; radius: number };
type SourceSize = { width: number; height: number };
type SnapGuideKind = "center-x" | "center-y" | "left" | "right" | "top" | "bottom";
type SnapGuideState = { frame: Frame; kinds: SnapGuideKind[] };

type TextBlockProps = {
  text: string;
  x: number;
  y: number;
  maxWidth: number;
  fontSize: number;
  maxLines: number;
  fill: string;
  weight?: number;
  letterSpacing?: number;
  verticalAnchor?: "center" | "first-line";
};

const WIDTH = 1080;
const HEIGHT = 1920;
const MARGIN = 64;
const GAP = 28;
const BANNER_Y = 82;
const BANNER_HEIGHT = 340;
const GRID_TOP = 482;
const GRID_BOTTOM = 1810;
const FONT_FAMILY = "Arial, sans-serif";

const PLACEHOLDER_GRADIENTS = [
  ["#342451", "#d15e4b"],
  ["#0c504d", "#65cda4"],
  ["#3656a5", "#ef9cbc"],
  ["#d06b33", "#f6c85e"],
  ["#432f67", "#9e83e5"],
  ["#1f5968", "#74ced3"],
] as const;

const IMAGE_SIZE_CACHE = new Map<string, SourceSize>();

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function getImageGeometry(frame: Frame, sourceSize: SourceSize | undefined, transform: ArtworkImageTransform) {
  const sourceRatio = sourceSize ? sourceSize.width / sourceSize.height : frame.width / frame.height;
  const frameRatio = frame.width / frame.height;
  const fittedWidth = sourceRatio >= frameRatio ? frame.width : frame.height * sourceRatio;
  const fittedHeight = sourceRatio >= frameRatio ? frame.width / sourceRatio : frame.height;
  const width = fittedWidth * transform.scale;
  const height = fittedHeight * transform.scale;

  return {
    x: frame.x + (frame.width - width) / 2 + transform.x,
    y: frame.y + (frame.height - height) / 2 + transform.y,
    width,
    height,
  };
}

function pointerInArtwork(svg: SVGSVGElement, clientX: number, clientY: number) {
  const matrix = svg.getScreenCTM();
  if (!matrix) return { x: 0, y: 0 };
  const point = new DOMPoint(clientX, clientY).matrixTransform(matrix.inverse());
  return { x: point.x, y: point.y };
}

function snapAxis(
  value: number,
  candidates: Array<{ value: number; kind: SnapGuideKind }>,
  threshold: number,
) {
  const closest = candidates.reduce<{ value: number; kind: SnapGuideKind; distance: number } | undefined>((best, candidate) => {
    const distance = Math.abs(value - candidate.value);
    if (distance > threshold || (best && best.distance <= distance)) return best;
    return { ...candidate, distance };
  }, undefined);

  if (!closest) return { value, kinds: [] as SnapGuideKind[] };
  return {
    value: closest.value,
    kinds: candidates.filter((candidate) => Math.abs(candidate.value - closest.value) < 0.01).map((candidate) => candidate.kind),
  };
}

function getColumns(count: number) {
  if (count === 1) return 1;
  if (count <= 6) return 2;
  return 3;
}

function isDark(color: string) {
  const value = color.replace("#", "");
  if (!/^[0-9a-f]{6}$/i.test(value)) return false;
  const red = parseInt(value.slice(0, 2), 16);
  const green = parseInt(value.slice(2, 4), 16);
  const blue = parseInt(value.slice(4, 6), 16);
  return (red * 299 + green * 587 + blue * 114) / 1000 < 120;
}

function estimatedCharacterWidth(character: string) {
  if (/[ilI1.,'!:;]/.test(character)) return 0.28;
  if (/[mwMW@%&]/.test(character)) return 0.9;
  if (/[A-Z0-9]/.test(character)) return 0.64;
  if (character === " ") return 0.3;
  return 0.53;
}

function estimatedTextWidth(text: string, fontSize: number, letterSpacing = 0) {
  return [...text].reduce((width, character) => width + estimatedCharacterWidth(character) * fontSize + letterSpacing, 0);
}

function splitLongWord(word: string, maxWidth: number, fontSize: number, letterSpacing: number) {
  const chunks: string[] = [];
  let chunk = "";
  for (const character of word) {
    const candidate = chunk + character;
    if (chunk && estimatedTextWidth(candidate, fontSize, letterSpacing) > maxWidth) {
      chunks.push(chunk);
      chunk = character;
    } else {
      chunk = candidate;
    }
  }
  if (chunk) chunks.push(chunk);
  return chunks;
}

function wrapText(text: string, maxWidth: number, fontSize: number, maxLines: number, letterSpacing = 0) {
  const lines: string[] = [];
  const requestedLines = text.trim().split(/\r?\n/);

  for (const requestedLine of requestedLines) {
    const words = requestedLine.split(/\s+/).filter(Boolean).flatMap((word) =>
      estimatedTextWidth(word, fontSize, letterSpacing) > maxWidth
        ? splitLongWord(word, maxWidth, fontSize, letterSpacing)
        : [word],
    );
    let line = "";

    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (line && estimatedTextWidth(candidate, fontSize, letterSpacing) > maxWidth) {
        lines.push(line);
        line = word;
      } else {
        line = candidate;
      }
    }
    lines.push(line);
  }

  const visible = lines.slice(0, maxLines);
  if (lines.length > maxLines && visible.length) {
    let last = visible[visible.length - 1];
    while (last && estimatedTextWidth(`${last}…`, fontSize, letterSpacing) > maxWidth) last = last.slice(0, -1);
    visible[visible.length - 1] = `${last.trimEnd()}…`;
  }
  return visible.length ? visible : [""];
}

function TextBlock({
  text,
  x,
  y,
  maxWidth,
  fontSize,
  maxLines,
  fill,
  weight = 800,
  letterSpacing = 0,
  verticalAnchor = "center",
}: TextBlockProps) {
  const lines = wrapText(text, maxWidth, fontSize, maxLines, letterSpacing);
  const lineHeight = fontSize * 1.08;
  const firstY = verticalAnchor === "first-line"
    ? y
    : y - ((lines.length - 1) * lineHeight) / 2;

  return (
    <text
      x={x}
      y={firstY}
      fill={fill}
      fontFamily={FONT_FAMILY}
      fontSize={fontSize}
      fontWeight={weight}
      letterSpacing={letterSpacing}
      textAnchor="middle"
      dominantBaseline="middle"
    >
      {lines.map((line, index) => <tspan key={`${line}-${index}`} x={x} y={firstY + index * lineHeight}>{line}</tspan>)}
    </text>
  );
}

function LoadingOverlay({ x, y, width, height, radius }: { x: number; y: number; width: number; height: number; radius: number }) {
  const size = Math.min(width, height) * 0.13;
  return (
    <g aria-label="Génération en cours" pointerEvents="none">
      <rect x={x} y={y} width={width} height={height} rx={radius} fill="#0f0f0f" opacity="0.55" />
      <path
        d={`M ${x + width / 2} ${y + height / 2 - size} L ${x + width / 2 + size * 0.26} ${y + height / 2 - size * 0.26} L ${x + width / 2 + size} ${y + height / 2} L ${x + width / 2 + size * 0.26} ${y + height / 2 + size * 0.26} L ${x + width / 2} ${y + height / 2 + size} L ${x + width / 2 - size * 0.26} ${y + height / 2 + size * 0.26} L ${x + width / 2 - size} ${y + height / 2} L ${x + width / 2 - size * 0.26} ${y + height / 2 - size * 0.26} Z`}
        fill="#eaff48"
      />
    </g>
  );
}

function EditableArtworkImage({
  imageId,
  label,
  source,
  frame,
  clipPathId,
  transform,
  selected,
  svgRef,
  onSelect,
  onTransform,
  onGuidesChange,
}: {
  imageId: string;
  label: string;
  source: string;
  frame: Frame;
  clipPathId: string;
  transform: ArtworkImageTransform;
  selected: boolean;
  svgRef: RefObject<SVGSVGElement | null>;
  onSelect: (imageId: string) => void;
  onTransform: (imageId: string, transform: ArtworkImageTransform) => void;
  onGuidesChange: (guides?: SnapGuideState) => void;
}) {
  const [sourceSize, setSourceSize] = useState<SourceSize | undefined>(() => IMAGE_SIZE_CACHE.get(source));
  const [dragging, setDragging] = useState(false);
  const dragState = useRef<{
    pointerId: number;
    start: { x: number; y: number };
    transform: ArtworkImageTransform;
  } | undefined>(undefined);

  useEffect(() => {
    const cached = IMAGE_SIZE_CACHE.get(source);
    if (cached) {
      setSourceSize(cached);
      return;
    }

    let active = true;
    setSourceSize(undefined);
    const image = new window.Image();
    image.onload = () => {
      if (!active || !image.naturalWidth || !image.naturalHeight) return;
      const size = { width: image.naturalWidth, height: image.naturalHeight };
      IMAGE_SIZE_CACHE.set(source, size);
      setSourceSize(size);
    };
    image.src = source;
    return () => { active = false; };
  }, [source]);

  const geometry = getImageGeometry(frame, sourceSize, transform);

  function beginDrag(event: ReactPointerEvent<SVGRectElement>) {
    if (event.button !== 0) return;
    const svg = svgRef.current;
    if (!svg) return;
    event.preventDefault();
    event.currentTarget.focus();
    event.currentTarget.setPointerCapture(event.pointerId);
    onSelect(imageId);
    dragState.current = {
      pointerId: event.pointerId,
      start: pointerInArtwork(svg, event.clientX, event.clientY),
      transform,
    };
    setDragging(true);
  }

  function moveImage(event: ReactPointerEvent<SVGRectElement>) {
    const drag = dragState.current;
    const svg = svgRef.current;
    if (!drag || drag.pointerId !== event.pointerId || !svg) return;
    event.preventDefault();

    const point = pointerInArtwork(svg, event.clientX, event.clientY);
    const dimensions = getImageGeometry(frame, sourceSize, { ...drag.transform, x: 0, y: 0 });
    const minimumVisibleX = Math.min(frame.width, dimensions.width) * 0.12;
    const minimumVisibleY = Math.min(frame.height, dimensions.height) * 0.12;
    const maximumX = (frame.width + dimensions.width) / 2 - minimumVisibleX;
    const maximumY = (frame.height + dimensions.height) / 2 - minimumVisibleY;
    let x = clamp(drag.transform.x + point.x - drag.start.x, -maximumX, maximumX);
    let y = clamp(drag.transform.y + point.y - drag.start.y, -maximumY, maximumY);
    const screenWidth = Math.max(svg.getBoundingClientRect().width, 1);
    const threshold = 9 * WIDTH / screenWidth;

    const snappedX = snapAxis(x, [
      { value: 0, kind: "center-x" },
      { value: (dimensions.width - frame.width) / 2, kind: "left" },
      { value: (frame.width - dimensions.width) / 2, kind: "right" },
    ], threshold);
    const snappedY = snapAxis(y, [
      { value: 0, kind: "center-y" },
      { value: (dimensions.height - frame.height) / 2, kind: "top" },
      { value: (frame.height - dimensions.height) / 2, kind: "bottom" },
    ], threshold);
    x = clamp(snappedX.value, -maximumX, maximumX);
    y = clamp(snappedY.value, -maximumY, maximumY);

    onTransform(imageId, { scale: drag.transform.scale, x, y });
    const kinds = [...snappedX.kinds, ...snappedY.kinds];
    onGuidesChange(kinds.length ? { frame, kinds } : undefined);
  }

  function endDrag(event: ReactPointerEvent<SVGRectElement>) {
    if (dragState.current?.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    dragState.current = undefined;
    setDragging(false);
    onGuidesChange(undefined);
  }

  function selectWithKeyboard(event: ReactKeyboardEvent<SVGRectElement>) {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    onSelect(imageId);
  }

  return (
    <g>
      <g clipPath={`url(#${clipPathId})`}>
        <image
          href={source}
          x={geometry.x}
          y={geometry.y}
          width={geometry.width}
          height={geometry.height}
          preserveAspectRatio={sourceSize ? "none" : "xMidYMid meet"}
        />
      </g>
      {selected && (
        <rect
          data-editor-only="true"
          x={frame.x}
          y={frame.y}
          width={frame.width}
          height={frame.height}
          rx={frame.radius}
          fill="none"
          stroke="#635bff"
          strokeWidth="3"
          vectorEffect="non-scaling-stroke"
          pointerEvents="none"
        />
      )}
      <rect
        data-editor-only="true"
        className={`editable-image-hit${dragging ? " dragging" : ""}`}
        x={frame.x}
        y={frame.y}
        width={frame.width}
        height={frame.height}
        rx={frame.radius}
        fill="transparent"
        stroke="none"
        strokeWidth="1"
        vectorEffect="non-scaling-stroke"
        pointerEvents="all"
        role="button"
        tabIndex={0}
        aria-label={`Modifier ${label}`}
        onKeyDown={selectWithKeyboard}
        onPointerDown={beginDrag}
        onPointerMove={moveImage}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onLostPointerCapture={() => {
          dragState.current = undefined;
          setDragging(false);
          onGuidesChange(undefined);
        }}
      />
    </g>
  );
}

function SnapGuides({ guides }: { guides?: SnapGuideState }) {
  if (!guides) return null;
  const { frame, kinds } = guides;
  const extension = 18;
  const common = {
    stroke: "#ff2d9a",
    strokeWidth: 2,
    vectorEffect: "non-scaling-stroke" as const,
    pointerEvents: "none" as const,
    "data-editor-only": "true",
  };

  return (
    <g>
      {kinds.includes("center-x") && <line {...common} x1={frame.x + frame.width / 2} y1={frame.y - extension} x2={frame.x + frame.width / 2} y2={frame.y + frame.height + extension} strokeDasharray="7 5" />}
      {kinds.includes("center-y") && <line {...common} x1={frame.x - extension} y1={frame.y + frame.height / 2} x2={frame.x + frame.width + extension} y2={frame.y + frame.height / 2} strokeDasharray="7 5" />}
      {kinds.includes("left") && <line {...common} x1={frame.x} y1={frame.y - extension} x2={frame.x} y2={frame.y + frame.height + extension} />}
      {kinds.includes("right") && <line {...common} x1={frame.x + frame.width} y1={frame.y - extension} x2={frame.x + frame.width} y2={frame.y + frame.height + extension} />}
      {kinds.includes("top") && <line {...common} x1={frame.x - extension} y1={frame.y} x2={frame.x + frame.width + extension} y2={frame.y} />}
      {kinds.includes("bottom") && <line {...common} x1={frame.x - extension} y1={frame.y + frame.height} x2={frame.x + frame.width + extension} y2={frame.y + frame.height} />}
    </g>
  );
}

function InlineSubjectEditor({
  x,
  y,
  width,
  height,
  fontSize,
  foreground,
  background,
  value,
  onChange,
  onFinish,
}: {
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
  foreground: string;
  background: string;
  value: string;
  onChange: (value: string) => void;
  onFinish: () => void;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, height - 8)}px`;
  }, [height, value]);

  useLayoutEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.focus();
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);
  }, []);

  return (
    <foreignObject data-editor-only="true" x={x} y={y} width={width} height={height}>
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "2px",
          background,
          boxSizing: "border-box",
        }}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <textarea
          ref={textareaRef}
          rows={1}
          maxLength={120}
          aria-label="Modifier le texte du sujet"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onBlur={onFinish}
          onKeyDown={(event) => {
            if (event.key !== "Escape") return;
            event.preventDefault();
            onFinish();
          }}
          style={{
            width: "100%",
            minHeight: `${fontSize * 1.15}px`,
            maxHeight: "100%",
            margin: 0,
            padding: "3px 6px",
            overflow: "hidden",
            resize: "none",
            border: "3px solid #635bff",
            borderRadius: "8px",
            outline: "none",
            background,
            color: foreground,
            fontFamily: FONT_FAMILY,
            fontSize: `${fontSize}px`,
            fontWeight: 800,
            lineHeight: 1.08,
            textAlign: "center",
            boxSizing: "border-box",
          }}
        />
      </div>
    </foreignObject>
  );
}

export const CoverArtwork = forwardRef<SVGSVGElement, CoverArtworkProps>(function CoverArtwork({
  background,
  title,
  titleImage,
  titleLoading = false,
  cards,
  imageTransforms,
  selectedImageId,
  onSelectImage,
  onDeselect,
  onTransformImage,
  editingCardTitleId,
  onEditCardTitle,
  onChangeCardTitle,
  onFinishCardTitle,
}, ref) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [snapGuides, setSnapGuides] = useState<SnapGuideState>();
  const instanceId = useId().replace(/:/g, "");
  const columns = getColumns(cards.length);
  const rows = Math.ceil(cards.length / columns);
  const compactGrid = cards.length <= 2;
  const foreground = isDark(background) ? "#ffffff" : "#111111";
  const gridAreaHeight = GRID_BOTTOM - GRID_TOP;
  const gridHeight = compactGrid ? gridAreaHeight / 2 : gridAreaHeight;
  const cellWidth = (WIDTH - MARGIN * 2 - GAP * (columns - 1)) / columns;
  const cellHeight = (gridHeight - GAP * (rows - 1)) / rows;
  const labelHeight = columns === 3 ? 76 : 92;
  const titleText = title.trim() || "VOTRE TITRE";
  const bannerFrame: Frame = { x: MARGIN, y: BANNER_Y, width: WIDTH - MARGIN * 2, height: BANNER_HEIGHT, radius: 32 };

  useImperativeHandle(ref, () => svgRef.current as SVGSVGElement, []);
  useEffect(() => setSnapGuides(undefined), [selectedImageId]);

  return (
    <svg
      ref={svgRef}
      className="cover-artwork-svg"
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      width={WIDTH}
      height={HEIGHT}
      role="img"
      aria-labelledby={`${instanceId}-artwork-title`}
      preserveAspectRatio="xMidYMid meet"
      style={{ fill: "#000000", stroke: "none", strokeWidth: 0 }}
      onPointerDown={(event) => {
        const target = event.target;
        if (
          target instanceof Element
          && target.closest(".editable-image-hit, .editable-subject-hit")
        ) return;
        onDeselect();
      }}
    >
      <title id={`${instanceId}-artwork-title`}>{`Aperçu de la couverture ${titleText}`}</title>
      <defs>
        <linearGradient id={`${instanceId}-banner-gradient`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#211a28" />
          <stop offset="1" stopColor="#e05744" />
        </linearGradient>
        <radialGradient id={`${instanceId}-banner-glow`} cx="0.2" cy="0.2" r="0.55">
          <stop offset="0" stopColor="#8f66bd" />
          <stop offset="1" stopColor="#8f66bd" stopOpacity="0" />
        </radialGradient>
        {PLACEHOLDER_GRADIENTS.map(([start, end], index) => (
          <linearGradient key={index} id={`${instanceId}-tile-gradient-${index}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor={start} />
            <stop offset="1" stopColor={end} />
          </linearGradient>
        ))}
        <clipPath id={`${instanceId}-banner-clip`}>
          <rect x={MARGIN} y={BANNER_Y} width={WIDTH - MARGIN * 2} height={BANNER_HEIGHT} rx="32" />
        </clipPath>
        {cards.map((card, index) => {
          const row = Math.floor(index / columns);
          const rowStart = row * columns;
          const itemsInRow = Math.min(columns, cards.length - rowStart);
          const column = index - rowStart;
          const rowWidth = itemsInRow * cellWidth + (itemsInRow - 1) * GAP;
          const rowOffset = (WIDTH - MARGIN * 2 - rowWidth) / 2;
          const x = MARGIN + rowOffset + column * (cellWidth + GAP);
          const y = GRID_TOP + row * (cellHeight + GAP);
          return <clipPath key={card.id} id={`${instanceId}-card-clip-${index}`}><rect x={x} y={y} width={cellWidth} height={cellHeight - labelHeight} rx={columns === 3 ? 22 : 28} /></clipPath>;
        })}
      </defs>

      <rect width={WIDTH} height={HEIGHT} fill={background} />

      <g clipPath={`url(#${instanceId}-banner-clip)`}>
        <rect x={MARGIN} y={BANNER_Y} width={WIDTH - MARGIN * 2} height={BANNER_HEIGHT} fill={titleImage ? background : `url(#${instanceId}-banner-gradient)`} />
        {!titleImage && <rect x={MARGIN} y={BANNER_Y} width={WIDTH - MARGIN * 2} height={BANNER_HEIGHT} fill={`url(#${instanceId}-banner-glow)`} />}
      </g>
      {titleImage && (
        <EditableArtworkImage
          imageId="title"
          label="la bannière titre"
          source={titleImage}
          frame={bannerFrame}
          clipPathId={`${instanceId}-banner-clip`}
          transform={imageTransforms.title ?? DEFAULT_IMAGE_TRANSFORM}
          selected={selectedImageId === "title"}
          svgRef={svgRef}
          onSelect={onSelectImage}
          onTransform={onTransformImage}
          onGuidesChange={setSnapGuides}
        />
      )}
      {!titleImage && (
        <g>
          <text x={WIDTH / 2} y={BANNER_Y + 86} fill="#eaff48" fontFamily={FONT_FAMILY} fontSize="22" fontWeight="700" letterSpacing="5" textAnchor="middle">VOTRE TITRE ICI</text>
          <TextBlock text={titleText} x={WIDTH / 2} y={BANNER_Y + 205} maxWidth={850} fontSize={64} maxLines={3} fill="#ffffff" />
        </g>
      )}
      {titleLoading && <LoadingOverlay x={MARGIN} y={BANNER_Y} width={WIDTH - MARGIN * 2} height={BANNER_HEIGHT} radius={32} />}

      {cards.map((card, index) => {
        const row = Math.floor(index / columns);
        const rowStart = row * columns;
        const itemsInRow = Math.min(columns, cards.length - rowStart);
        const column = index - rowStart;
        const rowWidth = itemsInRow * cellWidth + (itemsInRow - 1) * GAP;
        const rowOffset = (WIDTH - MARGIN * 2 - rowWidth) / 2;
        const x = MARGIN + rowOffset + column * (cellWidth + GAP);
        const y = GRID_TOP + row * (cellHeight + GAP);
        const imageHeight = cellHeight - labelHeight;
        const radius = columns === 3 ? 22 : 28;
        const cardTitle = card.title.trim() || `Sujet ${index + 1}`;
        const imageId = `card-${card.id}`;
        const frame: Frame = { x, y, width: cellWidth, height: imageHeight, radius };

        return (
          <g key={card.id}>
            <g clipPath={`url(#${instanceId}-card-clip-${index})`}>
              <rect x={x} y={y} width={cellWidth} height={imageHeight} fill={card.image ? background : `url(#${instanceId}-tile-gradient-${index % PLACEHOLDER_GRADIENTS.length})`} />
              {!card.image && (
                <TextBlock
                  text={String(index + 1).padStart(2, "0")}
                  x={x + cellWidth / 2}
                  y={y + imageHeight / 2}
                  maxWidth={cellWidth * 0.75}
                  fontSize={Math.min(cellWidth, imageHeight) * 0.18}
                  maxLines={1}
                  fill="rgba(255,255,255,0.78)"
                />
              )}
            </g>
            {card.image && (
              <EditableArtworkImage
                imageId={imageId}
                label={`l’image ${index + 1}`}
                source={card.image}
                frame={frame}
                clipPathId={`${instanceId}-card-clip-${index}`}
                transform={imageTransforms[imageId] ?? DEFAULT_IMAGE_TRANSFORM}
                selected={selectedImageId === imageId}
                svgRef={svgRef}
                onSelect={onSelectImage}
                onTransform={onTransformImage}
                onGuidesChange={setSnapGuides}
              />
            )}
            {card.loading && <LoadingOverlay x={x} y={y} width={cellWidth} height={imageHeight} radius={radius} />}
            <TextBlock
              text={cardTitle}
              x={x + cellWidth / 2}
              y={y + cellHeight - labelHeight / 2 + 6}
              maxWidth={cellWidth - 14}
              fontSize={columns === 3 ? 29 : 36}
              maxLines={2}
              fill={foreground}
              verticalAnchor="first-line"
            />
            <rect
              data-editor-only="true"
              className="editable-subject-hit"
              x={x}
              y={y + imageHeight}
              width={cellWidth}
              height={labelHeight}
              rx="8"
              fill="transparent"
              stroke="transparent"
              strokeWidth="2"
              vectorEffect="non-scaling-stroke"
              pointerEvents="all"
              role="button"
              tabIndex={0}
              aria-label={`Modifier le texte du sujet ${index + 1}`}
              onClick={() => onEditCardTitle(card.id)}
              onKeyDown={(event) => {
                if (event.key !== "Enter" && event.key !== " ") return;
                event.preventDefault();
                onEditCardTitle(card.id);
              }}
            />
            {editingCardTitleId === card.id && (
              <InlineSubjectEditor
                x={x}
                y={y + imageHeight}
                width={cellWidth}
                height={labelHeight}
                fontSize={columns === 3 ? 29 : 36}
                foreground={foreground}
                background={background}
                value={card.title}
                onChange={(value) => onChangeCardTitle(card.id, value)}
                onFinish={onFinishCardTitle}
              />
            )}
          </g>
        );
      })}

      <text
        data-editor-only="true"
        x={WIDTH / 2}
        y="1870"
        fill={foreground}
        fillOpacity={isDark(background) ? 0.65 : 0.48}
        fontFamily={FONT_FAMILY}
        fontSize="23"
        fontWeight="600"
        letterSpacing="3"
        textAnchor="middle"
      >FRAMEUP • 9:16</text>
      <SnapGuides guides={snapGuides} />
    </svg>
  );
});
