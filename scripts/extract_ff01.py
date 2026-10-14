#!/usr/bin/env python3
"""Extract native FF-01 PDF path geometry and room-label anchors reproducibly.

The extractor deliberately does not assign architectural semantics to CAD
paths. Every painted vector path is retained and emitted to an unresolved
queue until reviewed against the drawing.
"""

from __future__ import annotations

import argparse
import csv
import gzip
import hashlib
import json
import math
import re
from collections import Counter
from pathlib import Path
from typing import Any

import pdfplumber
import pymupdf
from pypdf import PdfReader
from pypdf.generic import ContentStream


ROOM_ID = re.compile(r"^([MAS]\d{3})(?:-(\d+))?$")
PAINT_OPS = {b"S", b"s", b"f", b"F", b"f*", b"B", b"B*", b"b", b"b*"}
PAGE_ROTATION = 270
METERS_PER_POINT_AT_1_TO_300 = 25.4 * 300 / 72 / 1000


def layer_semantics(name: str | None) -> tuple[str, str, str]:
    """Small explicit registry: names are CAD evidence, not proof of geometry."""
    value = name or "UNLAYERED"
    if value == "A05-建筑原有墙体": return "Existing Wall", "HIGH", "native path geometry; inspect joins and openings"
    if value == "A07-新建隔墙": return "New Partition", "HIGH", "native path geometry; inspect joins and openings"
    if value == "A04-建筑剪力墙柱填充": return "Structural Wall / Column", "HIGH", "native filled geometry; retain as structural candidate"
    if value == "P03-门扇": return "Door", "HIGH", "door-leaf candidates only; verify wall gap before claiming opening"
    upper = value.upper()
    if "楼梯" in value or "STRS" in upper or "STAIR" in upper: return "Stair", "MEDIUM", "native plan geometry; verify stair boundary"
    if "SEAT" in upper or "看台" in value or "座椅" in value or "STAND" in upper: return "Arena / Seating", "MEDIUM", "native plan geometry; distinguish stands from furniture"
    if value == "P01-平面完成面": return "Floor / Surface", "MEDIUM", "finished surface candidate; not necessarily walkable"
    if any(token in value for token in ("家具", "桌", "椅", "柜")) or "FURN" in upper or "FIXT" in upper: return "Furniture", "HIGH", "exclude from room boundary polygonization"
    if any(token in value for token in ("设备", "洁具", "消防栓")) or "EQUIP" in upper or "DUCT" in upper or "HV-" in upper: return "Equipment", "MEDIUM", "exclude from room boundary polygonization"
    if any(token in value for token in ("窗", "玻璃", "幕墙")) or "WINDOW" in upper or "GLAZ" in upper: return "Window / Glazing", "MEDIUM", "opening candidate; verify against wall geometry"
    if any(token in value for token in ("门",)) or "DOOR" in upper: return "Door", "MEDIUM", "candidate only; check adjacent wall geometry"
    if any(token in value for token in ("柱",)) or "COLS" in upper: return "Structural Wall / Column", "MEDIUM", "structural candidate; distinguish columns from walls"
    if "WALL" in upper or "墙" in value: return "Architectural Wall", "MEDIUM", "wall-layer candidate; classify exterior/interior by drawing context"
    if any(token in value for token in ("轴", "尺寸", "标注", "编号", "引线")) or any(token in upper for token in ("AXIS", "DIMS", "LEVL")): return "Grid / Dimension", "MEDIUM", "exclude from architectural boundary extraction"
    if any(token in value for token in ("文字", "房间名称", "图框")) or any(token in upper for token in ("TEXT", "TITLE", "SYMB")): return "Annotation", "MEDIUM", "exclude from architectural boundary extraction"
    if value == "UNLAYERED": return "Unknown", "NONE", "no CAD layer; do not infer from closure alone"
    return "Unknown", "LOW", "unmapped layer; manual semantic review required"


def extract_cad_layers(pdf_path: Path) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    """Retain PyMuPDF's native OCG layer metadata alongside original P IDs."""
    doc = pymupdf.open(pdf_path)
    if len(doc) != 1:
        raise ValueError(f"Expected one FF-01 page, found {len(doc)}")
    page = doc[0]
    drawings = page.get_drawings()
    matrix = page.rotation_matrix
    def display_point(point: Any) -> list[float]:
        transformed = pymupdf.Point(point.x, point.y) * matrix
        return [round(float(transformed.x), 4), round(float(transformed.y), 4)]
    def display_item(item: tuple[Any, ...]) -> list[Any]:
        kind, *values = item
        if kind in ("l", "c"):
            return [kind, *[display_point(value) for value in values]]
        if kind == "re":
            r = values[0]
            corners = [display_point(pymupdf.Point(r.x0, r.y0)), display_point(pymupdf.Point(r.x1, r.y0)),
                       display_point(pymupdf.Point(r.x1, r.y1)), display_point(pymupdf.Point(r.x0, r.y1))]
            return ["poly", corners]
        if kind == "qu":
            quad = values[0]
            return ["poly", [display_point(getattr(quad, key)) for key in ("ul", "ur", "lr", "ll")]]
        return [str(kind), *[fitz_value(value) for value in values]]
    grouped: dict[str, list[dict[str, Any]]] = {}
    for index, drawing in enumerate(drawings, 1):
        name = drawing.get("layer") or "UNLAYERED"
        grouped.setdefault(name, []).append(drawing)
    manifest = []
    for name, group in sorted(grouped.items(), key=lambda pair: (-len(pair[1]), pair[0])):
        rects = [d["rect"] for d in group if d.get("rect")]
        corners = [display_point(pymupdf.Point(x, y)) for r in rects for x, y in ((r.x0,r.y0),(r.x1,r.y0),(r.x1,r.y1),(r.x0,r.y1))]
        bbox = [round(min(p[0] for p in corners), 4), round(min(p[1] for p in corners), 4),
                round(max(p[0] for p in corners), 4), round(max(p[1] for p in corners), 4)] if corners else None
        styles = Counter(json.dumps({"type": d.get("type"), "color": d.get("color"), "fill": d.get("fill"),
                                     "width": d.get("width"), "closePath": d.get("closePath")}, sort_keys=True)
                         for d in group)
        semantic, confidence, strategy = layer_semantics(name)
        samples = []
        for d in group[:3]:
            r = d.get("rect")
            points = [display_point(pymupdf.Point(x, y)) for x, y in ((r.x0,r.y0),(r.x1,r.y0),(r.x1,r.y1),(r.x0,r.y1))] if r else []
            samples.append({"rect": [round(min(p[0] for p in points),3),round(min(p[1] for p in points),3),round(max(p[0] for p in points),3),round(max(p[1] for p in points),3)] if points else None,
                            "type": d.get("type"), "items": [display_item(item) for item in d.get("items", [])[:4]]})
        manifest.append({"originalLayerName": name, "pathCount": len(group), "boundingBoxDisplayPt": bbox,
                         "semanticCategory": semantic, "confidence": confidence, "extractionStrategy": strategy,
                         "styleVariants": [{"style": json.loads(style), "pathCount": count} for style, count in styles.most_common(12)],
                         "representativeGeometry": samples})
    return drawings, {"source": "PyMuPDF page.get_drawings() native layer attribute", "pageRotation": page.rotation,
                      "pageRect": [page.rect.x0, page.rect.y0, page.rect.x1, page.rect.y1],
                      "drawingPathCount": len(drawings), "distinctLayerCount": len(grouped), "layers": manifest}


def fitz_value(value: Any) -> Any:
    if all(hasattr(value, key) for key in ("ul", "ur", "ll", "lr")):
        return [fitz_value(getattr(value, key)) for key in ("ul", "ur", "lr", "ll")]
    if hasattr(value, "x") and hasattr(value, "y"): return [round(float(value.x), 4), round(float(value.y), 4)]
    if all(hasattr(value, key) for key in ("x0", "y0", "x1", "y1")):
        return [round(float(value.x0), 4), round(float(value.y0), 4), round(float(value.x1), 4), round(float(value.y1), 4)]
    if isinstance(value, (list, tuple)): return [fitz_value(item) for item in value]
    if isinstance(value, (str, int, float, bool)) or value is None: return value
    return str(value)


def display_native_item(item: tuple[Any, ...], matrix: Any) -> list[Any]:
    kind, *values = item
    def point(value: Any) -> list[float]:
        transformed = pymupdf.Point(value.x, value.y) * matrix
        return [round(float(transformed.x), 4), round(float(transformed.y), 4)]
    if kind in ("l", "c"):
        return [kind, *[point(value) for value in values]]
    if kind == "re":
        r = values[0]
        return ["poly", [point(pymupdf.Point(r.x0,r.y0)),point(pymupdf.Point(r.x1,r.y0)),point(pymupdf.Point(r.x1,r.y1)),point(pymupdf.Point(r.x0,r.y1))]]
    if kind == "qu":
        quad = values[0]
        return ["poly", [point(getattr(quad,key)) for key in ("ul","ur","lr","ll")]]
    return [str(kind), *[fitz_value(value) for value in values]]


def svg_for_native_path(path: dict[str, Any]) -> str:
    commands = []
    current = None
    for item in path.get("items", []):
        if not item: continue
        kind, *values = item
        if kind == "l" and len(values) == 2:
            a, b = values; commands.append(f"M {a[0]} {a[1]} L {b[0]} {b[1]}"); current = b
        elif kind == "c" and len(values) == 3:
            a, b, c = values
            if current is None: commands.append(f"M {a[0]} {a[1]}")
            commands.append(f"C {a[0]} {a[1]} {b[0]} {b[1]} {c[0]} {c[1]}"); current = c
        elif kind == "re" and len(values) >= 1:
            x0, y0, x1, y1 = values[0]
            commands.append(f"M {x0} {y0} H {x1} V {y1} H {x0} Z"); current = [x0, y0]
        elif kind == "qu" and len(values) == 1:
            quad = values[0]
            if len(quad) == 4:
                a, b, c, d = quad
                commands.append(f"M {a[0]} {a[1]} L {b[0]} {b[1]} L {d[0]} {d[1]} L {c[0]} {c[1]} Z")
                current = c
        elif kind == "poly" and len(values) == 1 and values[0]:
            points = values[0]
            commands.append("M " + " L ".join(f"{p[0]} {p[1]}" for p in points) + " Z")
            current = points[-1]
    if not commands: return ""
    def color(value: Any) -> str:
        if not isinstance(value, list) or len(value) < 3: return "none"
        return "#" + "".join(f"{round(max(0,min(1,float(v)))*255):02x}" for v in value[:3])
    stroke, fill = color(path.get("color")), color(path.get("fill"))
    width = max(float(path.get("width") or 0.1), 0.1)
    return f'<path d="{" ".join(commands)}" stroke="{stroke}" fill="{fill}" stroke-width="{width:.3f}" fill-rule="evenodd"/>'


def write_layer_previews(out: Path, public: Path, native_paths: list[dict[str, Any]], page_rect: list[float]) -> list[str]:
    groups = {
        "walls": {"Existing Wall", "New Partition", "Structural Wall / Column"},
        "doors": {"Door"}, "stairs": {"Stair"}, "arena-seating": {"Arena / Seating"},
    }
    outputs = []
    for name, categories in groups.items():
        elements = [svg_for_native_path(path) for path in native_paths if path["layerSemantic"] in categories]
        svg = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{page_rect[0]} {page_rect[1]} {page_rect[2]-page_rect[0]} {page_rect[3]-page_rect[1]}">'
               '<rect width="100%" height="100%" fill="#fffdf8"/><g stroke-linecap="round" stroke-linejoin="round">'
               + "".join(elements) + "</g></svg>")
        for base in (out, public):
            path = base / f"ff01-layer-{name}.svg"
            path.write_text(svg, encoding="utf-8"); outputs.append(str(path))
    return outputs


def enrich_with_layers(paths: list[dict[str, Any]], drawings: list[dict[str, Any]], rotation_matrix: Any) -> tuple[list[dict[str, Any]], list[dict[str, Any]], dict[str, Any]]:
    """Join legacy P IDs to native CAD paths only when extents support the join."""
    native = []
    paired = min(len(paths), len(drawings))
    bbox_errors = []
    for index, drawing in enumerate(drawings):
        r = drawing.get("rect")
        layer = drawing.get("layer") or "UNLAYERED"
        corners = [pymupdf.Point(x, y) * rotation_matrix for x, y in ((r.x0,r.y0),(r.x1,r.y0),(r.x1,r.y1),(r.x0,r.y1))] if r else []
        rect_display = [round(min(p.x for p in corners),4),round(min(p.y for p in corners),4),round(max(p.x for p in corners),4),round(max(p.y for p in corners),4)] if corners else None
        row = {"id": f"F{index + 1:05d}", "sourcePathID": None, "layer": layer,
               "layerSemantic": layer_semantics(layer)[0], "layerConfidence": layer_semantics(layer)[1],
               "type": drawing.get("type"), "rectNativePt": fitz_value(r), "rectPt": rect_display, "color": fitz_value(drawing.get("color")),
               "fill": fitz_value(drawing.get("fill")), "width": drawing.get("width"),
               "closePath": drawing.get("closePath"), "items": [display_native_item(item, rotation_matrix) for item in drawing.get("items", [])]}
        if index < paired:
            bbox = paths[index].get("bboxPt")
            native_bbox = row["rectPt"]
            if bbox and native_bbox:
                error = max(abs(float(a) - float(b)) for a, b in zip(bbox, native_bbox))
                bbox_errors.append(error)
                if error <= 2.0:
                    paths[index].update({"layer": layer, "layerSemantic": row["layerSemantic"],
                                         "layerConfidence": row["layerConfidence"], "sourcePathFitzID": row["id"],
                                         "layerJoinMethod": "sequence + bbox max-axis error <= 2pt"})
                    row["sourcePathID"] = paths[index]["id"]
        native.append(row)
    matched = sum(1 for drawing in native if drawing["sourcePathID"])
    stats = {"legacyPathCount": len(paths), "nativeFitzDrawingCount": len(drawings), "joinedByStableSequenceAndBbox": matched,
             "unjoinedNativeDrawings": len(drawings) - matched,
             "maxBboxErrorOfPairedPathsPt": round(max(bbox_errors), 4) if bbox_errors else None,
             "medianBboxErrorOfPairedPathsPt": round(sorted(bbox_errors)[len(bbox_errors)//2], 4) if bbox_errors else None,
             "joinStatus": "VERIFIED" if matched == len(paths) == len(drawings) else "PARTIAL"}
    return paths, native, stats


def num(value: Any) -> float:
    return float(value)


def matrix_multiply(left: list[float], right: list[float]) -> list[float]:
    a, b, c, d, e, f = left
    g, h, i, j, k, l = right
    return [a * g + c * h, b * g + d * h, a * i + c * j,
            b * i + d * j, a * k + c * l + e, b * k + d * l + f]


def transform_point(point: tuple[float, float], ctm: list[float], width: float, height: float) -> tuple[float, float]:
    x, y = point
    a, b, c, d, e, f = ctm
    page_x, page_y = a * x + c * y + e, b * x + d * y + f
    # Page /Rotate 270, mapped to the PDF viewer's top-left display frame.
    return height - page_y, width - page_x


def fmt(value: float) -> str:
    rounded = round(value, 4)
    if abs(rounded) < 0.00005:
        rounded = 0
    return f"{rounded:g}"


def color_from_components(components: list[float], space: str) -> str:
    if space == "gray":
        rgb = [components[0]] * 3
    elif space == "cmyk":
        c, m, y, k = components
        rgb = [(1 - min(1, x + k)) for x in (c, m, y)]
    else:
        rgb = components[:3]
    return "#" + "".join(f"{max(0, min(255, round(v * 255))):02x}" for v in rgb)


def extract_paths(reader: PdfReader, page: Any) -> tuple[list[dict[str, Any]], Counter[str], int]:
    page_width, page_height = float(page.mediabox.width), float(page.mediabox.height)
    operations = ContentStream(page.get_contents(), reader).operations
    state = {
        "ctm": [1.0, 0, 0, 1.0, 0, 0], "line_width": 1.0,
        "stroke": "#000000", "fill": "#000000", "line_cap": 0,
        "line_join": 0, "miter_limit": 10.0,
    }
    stack: list[dict[str, Any]] = []
    path_ops: list[tuple[bytes, list[float]]] = []
    path_points: list[tuple[float, float]] = []
    subpath_start: tuple[float, float] | None = None
    current: tuple[float, float] | None = None
    paths: list[dict[str, Any]] = []
    operator_counts: Counter[str] = Counter()
    clipping_path_count = 0

    def point(x: Any, y: Any) -> tuple[float, float]:
        return transform_point((num(x), num(y)), state["ctm"], page_width, page_height)

    def paint(operator: bytes) -> None:
        nonlocal path_ops, path_points, subpath_start, current
        if path_ops:
            paint_name = operator.decode("ascii")
            closes = operator in {b"s", b"b", b"b*"}
            fills = operator in {b"f", b"F", b"f*", b"B", b"B*", b"b", b"b*"}
            strokes = operator in {b"S", b"s", b"B", b"B*", b"b", b"b*"}
            if closes and current is not None and subpath_start is not None:
                path_ops.append((b"Z", []))
            xs = [p[0] for p in path_points]
            ys = [p[1] for p in path_points]
            a, b, c, d, _, _ = state["ctm"]
            scale = math.sqrt(abs(a * d - b * c))
            paths.append({
                "id": f"P{len(paths) + 1:05d}", "paint": paint_name,
                "stroke": strokes, "fill": fills,
                "strokeColor": state["stroke"] if strokes else None,
                "fillColor": state["fill"] if fills else None,
                "lineWidthPt": round(state["line_width"] * scale, 4) if strokes else None,
                "lineCap": state["line_cap"], "lineJoin": state["line_join"],
                "bboxPt": [round(min(xs), 4), round(min(ys), 4), round(max(xs), 4), round(max(ys), 4)] if xs else None,
                "pointCount": len(path_points),
                "path": [[op.decode("ascii"), [round(v, 4) for v in args]] for op, args in path_ops],
                "classification": "unresolved",
            })
        path_ops, path_points, subpath_start, current = [], [], None, None

    for operands, operator in operations:
        name = operator.decode("latin1")
        operator_counts[name] += 1
        if operator == b"q":
            stack.append(state.copy())
        elif operator == b"Q":
            if stack:
                state = stack.pop()
        elif operator == b"cm":
            state["ctm"] = matrix_multiply(state["ctm"], [num(v) for v in operands])
        elif operator == b"w":
            state["line_width"] = num(operands[0])
        elif operator == b"J":
            state["line_cap"] = int(operands[0])
        elif operator == b"j":
            state["line_join"] = int(operands[0])
        elif operator == b"M":
            state["miter_limit"] = num(operands[0])
        elif operator in (b"RG", b"rg"):
            color = color_from_components([num(v) for v in operands], "rgb")
            state["stroke" if operator == b"RG" else "fill"] = color
        elif operator in (b"G", b"g"):
            color = color_from_components([num(operands[0])], "gray")
            state["stroke" if operator == b"G" else "fill"] = color
        elif operator in (b"K", b"k"):
            color = color_from_components([num(v) for v in operands], "cmyk")
            state["stroke" if operator == b"K" else "fill"] = color
        elif operator == b"m":
            current = point(*operands)
            subpath_start = current
            path_ops.append((b"M", list(current)))
            path_points.append(current)
        elif operator == b"l":
            current = point(*operands)
            path_ops.append((b"L", list(current)))
            path_points.append(current)
        elif operator == b"c":
            p1, p2, end = point(*operands[:2]), point(*operands[2:4]), point(*operands[4:6])
            path_ops.append((b"C", [*p1, *p2, *end]))
            path_points.extend((p1, p2, end))
            current = end
        elif operator == b"v" and current is not None:
            p2, end = point(*operands[:2]), point(*operands[2:4])
            path_ops.append((b"C", [*current, *p2, *end]))
            path_points.extend((current, p2, end))
            current = end
        elif operator == b"y":
            p1 = point(*operands[:2])
            end = point(*operands[2:4])
            path_ops.append((b"C", [*p1, *end, *end]))
            path_points.extend((p1, end))
            current = end
        elif operator == b"h":
            path_ops.append((b"Z", []))
            current = subpath_start
        elif operator == b"re":
            x, y, width, height = [num(v) for v in operands]
            corners = [point(x, y), point(x + width, y), point(x + width, y + height), point(x, y + height)]
            path_ops.extend([(b"M", list(corners[0])), *[(b"L", list(p)) for p in corners[1:]], (b"Z", [])])
            path_points.extend(corners)
            current = subpath_start = corners[0]
        elif operator in PAINT_OPS:
            paint(operator)
        elif operator == b"n":
            if path_ops:
                clipping_path_count += 1
            paint_ops = path_ops
            path_ops, path_points, subpath_start, current = [], [], None, None
        elif operator == b"Do":
            raise ValueError("PDF uses a Form/Image XObject; recursive XObject extraction is not implemented")
    if path_ops:
        raise ValueError("Unpainted path remains at end of content stream")
    return paths, operator_counts, clipping_path_count


def svg_path(path_ops: list[list[Any]]) -> str:
    commands = []
    for op, args in path_ops:
        if op == "Z":
            commands.append("Z")
        else:
            commands.append(op + " " + " ".join(fmt(float(v)) for v in args))
    return " ".join(commands)


def run() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--pdf", type=Path, required=True)
    parser.add_argument("--repo", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument("--output-dir", type=Path, default=None)
    args = parser.parse_args()
    repo = args.repo.resolve()
    pdf_path = args.pdf.resolve()
    out = (args.output_dir or repo / "data/source").resolve()
    out.mkdir(parents=True, exist_ok=True)
    public = repo / "public"
    public.mkdir(parents=True, exist_ok=True)

    with pdfplumber.open(str(pdf_path)) as pdf:
        if len(pdf.pages) != 1:
            raise ValueError(f"Expected one FF-01 page, found {len(pdf.pages)}")
        pp = pdf.pages[0]
        reader = PdfReader(str(pdf_path), strict=False)
        page = reader.pages[0]
        display_width, display_height = float(pp.width), float(pp.height)
        if pp.rotation != PAGE_ROTATION:
            raise ValueError(f"Expected page rotation {PAGE_ROTATION}, found {pp.rotation}")
        text_words = pp.extract_words()

        # These are the four endpoints of the two long, thin overall dimension
        # chains. The matched printed labels are checked below; they are axis
        # extents and are not asserted to be the exterior-wall footprint.
        horizontal = [line for line in pp.lines if line["width"] > 1200 and abs(line["height"]) < 0.02 and line["linewidth"] < 0.3]
        vertical = [line for line in pp.lines if line["height"] > 1000 and abs(line["width"]) < 0.02 and line["linewidth"] < 0.3]
        if len(horizontal) < 2 or len(vertical) < 2:
            raise ValueError("Could not find both overall dimension-chain candidates in native vector geometry")
        frame = {
            "minXPt": round(min(min(l["x0"], l["x1"]) for l in horizontal), 4),
            "maxXPt": round(max(max(l["x0"], l["x1"]) for l in horizontal), 4),
            "minYPt": round(min(min(l["top"], l["bottom"]) for l in vertical), 4),
            "maxYPt": round(max(max(l["top"], l["bottom"]) for l in vertical), 4),
            "source": "endpoints of native long thin overall dimension-chain lines; cross-checked with printed overall dimensions; not the exterior footprint",
        }
        scale = METERS_PER_POINT_AT_1_TO_300
        frame_width_pt = frame["maxXPt"] - frame["minXPt"]
        frame_height_pt = frame["maxYPt"] - frame["minYPt"]
        dimensions = []
        for axis, measured, label in (("X", frame_width_pt, 134100), ("Z", frame_height_pt, 115800)):
            reconstructed_mm = measured * scale * 1000
            absolute_error_mm = reconstructed_mm - label
            dimensions.append({
                "axis": axis, "sourceLabelMm": label, "measuredPdfPt": round(measured, 4),
                "reconstructedMm": round(reconstructed_mm, 3), "absoluteErrorMm": round(absolute_error_mm, 3),
                "relativeErrorPercent": round(abs(absolute_error_mm) / label * 100, 5),
                "status": "VERIFIED" if abs(absolute_error_mm) / label <= 0.01 else "UNVERIFIED",
                "note": "axis/dimension-chain extent, not outside wall-to-wall footprint",
            })
        frame["widthMeters"] = round(frame_width_pt * scale, 4)
        frame["heightMeters"] = round(frame_height_pt * scale, 4)

        pdf_words = [w for w in text_words if w.get("text", "").strip()]
        labels: list[dict[str, Any]] = []
        def text_visitor(text: str, cm: Any, tm: Any, font: Any, font_size: float) -> None:
            for match in re.finditer(r"\b([MAS]\d{3}(?:-\d+)?)\b", text.upper()):
                a, b, c, d, e, f = [num(v) for v in cm]
                g, h, i, j, k, l = [num(v) for v in tm]
                pdf_x = a * k + c * l + e
                pdf_y = b * k + d * l + f
                label_x, label_y = display_width - pdf_y, display_height - pdf_x
                room_id = match.group(1)
                candidates = []
                for word in pdf_words:
                    token = word["text"].strip().upper()
                    if token != room_id and not token.startswith(room_id + " "):
                        continue
                    cx, cy = (word["x0"] + word["x1"]) / 2, (word["top"] + word["bottom"]) / 2
                    distance = math.hypot(cx - label_x, cy - label_y)
                    if distance <= 22:
                        candidates.append((distance, cx, cy, word))
                if candidates:
                    _, label_x, label_y, word = min(candidates, key=lambda item: item[0])
                    nearby = []
                    for candidate in pdf_words:
                        if candidate is word or ROOM_ID.fullmatch(candidate["text"].strip().upper()):
                            continue
                        dx = ((candidate["x0"] + candidate["x1"]) / 2) - label_x
                        dy = ((candidate["top"] + candidate["bottom"]) / 2) - label_y
                        if abs(dx) <= 60 and abs(dy) <= 38:
                            nearby.append((math.hypot(dx, dy), candidate["text"]))
                    nearby_text = " | ".join(value for _, value in sorted(nearby)[:5])
                    coordinate_method = "PDF text bbox center"
                else:
                    nearby_text = ""
                    coordinate_method = "PDF text matrix baseline origin"
                labels.append({"id": room_id, "xPt": label_x, "yPt": label_y,
                               "nearby": nearby_text, "coordinateMethod": coordinate_method,
                               "textObject": text.strip()})
        page.extract_text(visitor_text=text_visitor)
        if not labels:
            raise ValueError("No room IDs matching [MAS]### were extracted")

        app_source = repo / "src/data/floorplanData.ts"
        app_ids = set(re.findall(r"\bid:\s*'([MAS]\d{3})'", app_source.read_text())) if app_source.exists() else set()
        manifest_rows = []
        runtime_anchors = []
        labels.sort(key=lambda row: (row["id"], row["yPt"], row["xPt"]))
        occurrence_counter: Counter[str] = Counter()
        for label in labels:
            room_id = label["id"]
            base_id = ROOM_ID.fullmatch(room_id).group(1)
            occurrence_counter[room_id] += 1
            cx, cy = label["xPt"], label["yPt"]
            plan_x = (cx - frame["minXPt"]) * 1000 / frame_width_pt
            # A single point scale keeps X/Z isotropic; do not fit axes independently.
            plan_y = (cy - frame["minYPt"]) * 1000 / frame_width_pt
            world_x_m = (cx - frame["minXPt"]) * scale
            world_z_m = (cy - frame["minYPt"]) * scale
            matched_id = room_id if room_id in app_ids else ""
            manifest_rows.append({
                "SourceRoomLabel": room_id, "BaseRoomCode": base_id,
                "OccurrenceIndex": occurrence_counter[room_id],
                "SourceLabelXPt": round(cx, 4), "SourceLabelYPt": round(cy, 4),
                "PlanXNormalized": round(plan_x, 4), "PlanYNormalized": round(plan_y, 4),
                "WorldXMeters": round(world_x_m, 4), "WorldZMeters": round(world_z_m, 4),
                "MatchedApplicationSpaceID": matched_id,
                "NearbySourceTextCandidates": label["nearby"],
                "SourceTextObject": label["textObject"],
                "GeometryStatus": "UNRESOLVED", "LabelCoordinateMethod": label["coordinateMethod"],
                "Confidence": "HIGH for source-label position; none for room boundary",
                "OutstandingIssues": "No vector path-to-room boundary assignment; do not synthesize a polygon from this anchor",
            })
            runtime_anchors.append({"id": room_id, "baseId": base_id, "x": round(plan_x, 4), "y": round(plan_y, 4),
                                    "pdfXPt": round(cx, 4), "pdfYPt": round(cy, 4)})

        paths, operator_counts, clipping_paths = extract_paths(reader, page)
        if len(paths) != 33355:
            raise ValueError(f"Painted path count changed: expected 33355, got {len(paths)}")
        fitz_drawings, layer_manifest = extract_cad_layers(pdf_path)
        rotation_matrix = pymupdf.open(pdf_path)[0].rotation_matrix
        paths, native_paths, layer_join = enrich_with_layers(paths, fitz_drawings, rotation_matrix)
        pdf_sha = hashlib.sha256(pdf_path.read_bytes()).hexdigest()

        source_ids = {row["id"] for row in labels}
        base_ids = {ROOM_ID.fullmatch(value).group(1) for value in source_ids}
        app_only = sorted(app_ids - base_ids)
        source_only = sorted(source_ids - app_ids)
        summary = {
            "sourcePdf": str(pdf_path), "sourcePdfSha256": pdf_sha,
            "pageCount": len(pdf.pages), "pageRotation": pp.rotation,
            "sourcePagePoints": [display_width, display_height],
            "pageWordCount": len(text_words), "roomLabelOccurrences": len(labels),
            "uniqueSourceRoomLabelIDs": len(source_ids), "uniqueBaseRoomCodes": len(base_ids),
            "applicationSpaceIDsMatched": len(app_ids & base_ids),
            "applicationSpaceIDsMissingFromSource": app_only, "sourceRoomIDsMissingFromApplication": source_only,
            "paintedNativePathCount": len(paths), "pathPaintOperators": {k: operator_counts[k] for k in ("S", "s", "f", "F", "f*", "B", "B*", "b", "b*")},
            "nonPaintingClipPaths": clipping_paths, "operatorCount": sum(operator_counts.values()),
            "coordinateSystem": {
                "pdfDisplay": "page rotation 270 normalized by pdfplumber; origin top-left; units PDF points",
                "plan": "normalized grid frame with a single isotropic scale; X/Z units are 1000 plan units per calibrated grid width",
                "world": "meters; X east, Z south, Y elevation; scale 1:300",
                "gridFrame": frame,
                "transform": {
                    "planX": "(pdfDisplayXPt - minXPt) * 1000 / (maxXPt - minXPt)",
                    "planY": "(pdfDisplayYPt - minYPt) * 1000 / (maxXPt - minXPt)",
                    "worldXmeters": "(pdfDisplayXPt - minXPt) * 25.4 * 300 / 72 / 1000",
                    "worldZmeters": "(pdfDisplayYPt - minYPt) * 25.4 * 300 / 72 / 1000",
                },
                "axisDimensionValidation": dimensions,
                "scopeWarning": "Grid/dimension frame is not asserted to equal outside building footprint.",
            },
            "cadLayers": {"distinctLayerCount": layer_manifest["distinctLayerCount"],
                          "nativeDrawingCount": layer_manifest["drawingPathCount"], "pathJoin": layer_join},
            "semantics": {"verifiedArchitecturalPaths": 0, "unresolvedPaintedPaths": len(paths),
                          "reason": "CAD layers identify source drawing classes and provide candidates; room/wall/door topology still requires geometric and human verification."},
        }

    vectors_path = out / "ff01-vectors.json.gz"
    raw_json = json.dumps({"summary": summary, "paths": paths, "cadDrawings": native_paths}, ensure_ascii=False, separators=(",", ":")).encode()
    with vectors_path.open("wb") as file:
        with gzip.GzipFile(fileobj=file, mode="wb", mtime=0, filename="") as zipped:
            zipped.write(raw_json)

    (out / "FF01_LAYER_MANIFEST.json").write_text(json.dumps(layer_manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    structural_categories = {"Existing Wall", "New Partition", "Structural Wall / Column", "Architectural Wall", "Door", "Stair", "Arena / Seating"}
    structural = [d for d in native_paths if d["layerSemantic"] in structural_categories]
    payload = json.dumps({"sourcePdfSha256": summary["sourcePdfSha256"], "status": "CANDIDATE_NOT_VERIFIED",
                          "geometry": structural}, ensure_ascii=False, separators=(",", ":")).encode()
    with (out / "ff01-structural-candidates.json.gz").open("wb") as raw:
        with gzip.GzipFile(fileobj=raw, mode="wb", mtime=0, filename="") as zipped: zipped.write(payload)
    with (out / "STRUCTURAL_CANDIDATES.csv").open("w", encoding="utf-8-sig", newline="") as file:
        fields = ["SourceFitzPathID", "SourcePathID", "Layer", "SemanticCategory", "LayerConfidence", "PathType", "MinXPt", "MinYPt", "MaxXPt", "MaxYPt", "Status"]
        writer = csv.DictWriter(file, fieldnames=fields); writer.writeheader()
        for path in structural:
            bbox = path["rectPt"] or ["", "", "", ""]
            writer.writerow({"SourceFitzPathID": path["id"], "SourcePathID": path["sourcePathID"] or "", "Layer": path["layer"],
                             "SemanticCategory": path["layerSemantic"], "LayerConfidence": path["layerConfidence"], "PathType": path["type"],
                             "MinXPt": bbox[0], "MinYPt": bbox[1], "MaxXPt": bbox[2], "MaxYPt": bbox[3], "Status": "CANDIDATE_NOT_VERIFIED"})

    with (out / "ROOM_MANIFEST.csv").open("w", encoding="utf-8-sig", newline="") as file:
        fields = list(manifest_rows[0].keys())
        writer = csv.DictWriter(file, fieldnames=fields)
        writer.writeheader()
        writer.writerows(manifest_rows)
    with (out / "UNRESOLVED_GEOMETRY.csv").open("w", encoding="utf-8-sig", newline="") as file:
        fields = ["SourcePathID", "SourceFitzPathID", "Layer", "PaintOperator", "Stroke", "Fill", "StrokeColor", "FillColor", "StrokeWidthPt",
                  "MinXPt", "MinYPt", "MaxXPt", "MaxYPt", "PointCount", "Classification", "GeometryStatus", "Reason"]
        writer = csv.DictWriter(file, fieldnames=fields)
        writer.writeheader()
        for path in paths:
            bbox = path["bboxPt"] or ["", "", "", ""]
            writer.writerow({"SourcePathID": path["id"], "PaintOperator": path["paint"],
                             "Stroke": path["stroke"], "Fill": path["fill"], "StrokeColor": path["strokeColor"],
                             "FillColor": path["fillColor"], "StrokeWidthPt": path["lineWidthPt"],
                             "MinXPt": bbox[0], "MinYPt": bbox[1], "MaxXPt": bbox[2], "MaxYPt": bbox[3],
                             "PointCount": path["pointCount"], "SourceFitzPathID": path.get("sourcePathFitzID", ""),
                             "Layer": path.get("layer", "UNMATCHED"), "Classification": path.get("layerSemantic", "Unknown"),
                             "GeometryStatus": "CANDIDATE_NOT_VERIFIED",
                             "Reason": "CAD layer supports candidate classification; no room/wall/door topology has been verified"})

    anchor_ts = "// Generated by scripts/extract_ff01.py; do not hand edit.\n"
    anchor_ts += "export interface SourceAnchor { id: string; baseId: string; x: number; y: number; pdfXPt: number; pdfYPt: number }\n"
    anchor_ts += "export const SOURCE_ANCHORS: SourceAnchor[] = " + json.dumps(runtime_anchors, ensure_ascii=False, indent=2) + ";\n"
    anchor_ts += "export const SOURCE_LABEL_ANCHORS: Record<string, { x: number; y: number }> = Object.fromEntries(SOURCE_ANCHORS.filter((anchor) => anchor.id === anchor.baseId).map(({ id, x, y }) => [id, { x, y }]));\n"
    anchor_ts += "export const SOURCE_GRID_FRAME = " + json.dumps(frame, indent=2) + " as const;\n"
    (repo / "src/data/sourceAnchors.ts").write_text(anchor_ts, encoding="utf-8")

    layer_previews = write_layer_previews(out, public, native_paths, layer_manifest["pageRect"])

    source_svg = public / "ff01-source-plan.svg"
    viewbox = f'0 0 {display_width} {display_height}'
    svg = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{viewbox}" width="2384" height="1684">',
           f'<rect x="0" y="0" width="{display_width}" height="{display_height}" fill="#fffdf8"/>',
           '<g fill="none" stroke-linecap="round" stroke-linejoin="round">']
    for path in paths:
        d = svg_path(path["path"])
        if not d:
            continue
        stroke = path["strokeColor"] or "none"
        fill = path["fillColor"] or "none"
        # SVG zero-width strokes are invisible; PDF zero-width strokes are hairlines.
        width = max(path["lineWidthPt"] or 0, 0.15) if path["stroke"] else 0
        svg.append(f'<path d="{d}" stroke="{stroke}" fill="{fill}" stroke-width="{fmt(width)}" fill-rule="evenodd"/>')
    svg.append('</g><g fill="#087f8c" stroke="#fffdf8" stroke-width="0.6" paint-order="stroke">')
    for anchor in runtime_anchors:
        svg.append(f'<text x="{fmt(anchor["pdfXPt"])}" y="{fmt(anchor["pdfYPt"])}" font-family="Arial,sans-serif" font-size="5.5" text-anchor="middle">{anchor["id"]}</text>')
    svg.append('</g></svg>')
    source_svg.write_text("\n".join(svg), encoding="utf-8")

    # This crop uses exactly the same point-space frame as the vector export.
    pp.to_image(resolution=96, antialias=True).save(public / "ff01-source-plan.png")

    summary_path = out / "spatial-extraction-summary.json"
    summary_path.write_text(json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"summary": summary, "outputs": [str(vectors_path), str(out / "FF01_LAYER_MANIFEST.json"),
        str(out / "STRUCTURAL_CANDIDATES.csv"), str(out / "ff01-structural-candidates.json.gz"),
        str(out / "ROOM_MANIFEST.csv"), str(out / "UNRESOLVED_GEOMETRY.csv"), str(source_svg),
        str(public / "ff01-source-plan.png"), str(summary_path), *layer_previews]}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    run()
