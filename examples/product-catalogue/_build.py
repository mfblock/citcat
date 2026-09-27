#!/usr/bin/env python3
"""Rebuild product-showcase.citcat from the base layout plus its data wiring.

The layout was authored by hand; this script adds the parts that have to stay
in step with sample-products.csv — the data source, the bindings, the
conditional badges — so a column rename cannot leave the project silently
pointing at nothing.

    python3 examples/product-catalogue/_build.py
"""
import json
import uuid
from pathlib import Path

HERE = Path(__file__).resolve().parent
PROJECT = HERE / "product-showcase.citcat"


def uid():
    return str(uuid.uuid4())


def style(**kw):
    s = {
        "fill": "#ffffff", "stroke": "#000000", "stroke_width": 0.0,
        "font_family": "system-ui", "font_size": 24.0, "font_weight": 400,
        "text_align": "Left", "line_height": 1.4, "border_radius": 0.0,
        "fill_gradient": None, "stroke_gradient": None,
    }
    s.update(kw)
    return s


def obj(name, kind, x, y, w, h, *, z=10, st=None, content="",
        bindings=None, condition=None, filters=None, keyframes=None,
        text_wrap=None, appear=None):
    o = {
        "id": uid(), "name": name, "object_type": kind,
        "transform": {"x": float(x), "y": float(y), "width": float(w),
                      "height": float(h), "rotation": 0.0, "opacity": 1.0},
        "style": st or style(), "content": content, "z_index": z,
        "visible": True, "locked": False,
        "keyframes": keyframes or [], "events": [],
        "data_bindings": bindings or [], "condition": condition,
    }
    if filters is not None:
        o["filters"] = filters
    if text_wrap is not None:
        o["text_wrap"] = text_wrap
    if appear is not None:
        o["appear_at_ms"] = appear
    return o


def bind(prop, column, transform=None):
    return {"id": uid(), "property": prop, "column": column,
            "transform": transform or {"type": "None"}}


def cond(column, op, value=""):
    return {"column": column, "operator": op, "value": value}


def kf(t, prop, val, easing="EaseOut"):
    v = {"type": "Color", "value": val} if isinstance(val, str) else \
        {"type": "Number", "value": float(val)}
    return {"id": uid(), "time_ms": int(t), "property": prop,
            "value": v, "easing": easing}


# ---------------------------------------------------------------- scene 1
def scene_hero():
    objs = [
        # A photo of the machine, bound per row through ImagePath. The prefix is
        # how a catalogue keeps bare file names in its data and still resolves
        # them to a folder at render time.
        obj("Product Image", "Image", 1180, 240, 620, 465, z=5,
            content="images/x500.png",
            bindings=[bind("content", "image_file",
                           {"type": "ImagePath", "prefix": "images/"})]),

        obj("Divider", "Rect", 120, 230, 200, 3, z=7,
            st=style(fill="#7c3aed")),

        obj("Description", "Text", 120, 260, 900, 200, z=8, text_wrap=True,
            st=style(fill="#cccccc", font_size=22.0),
            content="{{description}}",
            bindings=[bind("content", "description")]),

        obj("Category", "Text", 120, 170, 600, 40, z=9,
            st=style(fill="#a78bfa", font_size=26.0, font_weight=600),
            content="{{category}}",
            bindings=[bind("content", "category", {"type": "Uppercase"})]),

        obj("Product Name", "Text", 120, 80, 1200, 80, z=10,
            st=style(fill="#ffffff", font_size=64.0, font_weight=700),
            content="{{product_name}}",
            bindings=[bind("content", "product_name")]),

        # price_eur is a bare number in the data; the currency symbol and the
        # two decimals are presentation, applied here rather than baked in.
        obj("Price", "Text", 1180, 120, 620, 80, z=11,
            st=style(fill="#22c55e", font_size=56.0, font_weight=700,
                     text_align="Right"),
            content="{{price}}",
            bindings=[bind("content", "price_eur",
                           {"type": "FormatCurrency",
                            "symbol": "€", "decimals": 2})]),

        # Article numbers are printed lower-case in this catalogue's house style,
        # while the data keeps them upper-case as the ERP exports them.
        obj("SKU", "Text", 1180, 200, 620, 34, z=11,
            st=style(fill="#64748b", font_size=20.0, text_align="Right"),
            content="{{sku}}",
            bindings=[bind("content", "sku", {"type": "Lowercase"})]),

        obj("Details Button", "Button", 120, 520, 240, 56, z=12,
            st=style(fill="#7c3aed", font_size=22.0, font_weight=600,
                     border_radius=8.0),
            content="Details →"),
    ]

    # --- conditional badges -------------------------------------------------
    # Each one answers a question a buyer actually asks, and together they
    # exercise every ConditionOp the model defines.
    badges = [
        # tier == premium
        ("Premium Badge", "PREMIUM", "#f59e0b", 120, 620,
         cond("tier", "Equals", "premium")),
        # tier != premium
        ("Standard Badge", "STANDARD RANGE", "#475569", 120, 620,
         cond("tier", "NotEquals", "premium")),
        # stock < 5
        ("Low Stock Badge", "LOW STOCK", "#ef4444", 400, 620,
         cond("stock", "LessThan", "5")),
        # stock > 50
        ("In Stock Badge", "IN STOCK", "#22c55e", 400, 620,
         cond("stock", "GreaterThan", "50")),
        # lead_time is filled in
        ("Lead Time Badge", "MADE TO ORDER", "#7c3aed", 700, 620,
         cond("lead_time", "NotEmpty")),
        # lead_time is blank
        ("Ships Now Badge", "SHIPS FROM STOCK", "#0ea5e9", 700, 620,
         cond("lead_time", "Empty")),
        # description mentions energy
        ("Eco Badge", "ENERGY SAVING", "#10b981", 1060, 620,
         cond("description", "Contains", "energy")),
    ]
    for name, label, colour, x, y, c in badges:
        objs.append(obj(
            name, "Button", x, y, 260, 44, z=13,
            st=style(fill=colour, font_size=18.0, font_weight=700,
                     border_radius=22.0),
            content=label, condition=c))

    return {
        "id": uid(), "name": "Product Hero", "duration_ms": 6000,
        "background": {
            "fill": "#0a0a1a",
            "gradient": {
                "gradient_type": "Linear", "angle": 0.0,
                "stops": [{"offset": 0.0, "color": "#0a0a1a"},
                          {"offset": 1.0, "color": "#1a1a2e"}],
            },
            "image": None,
        },
        "objects": objs,
        "transition_in": None, "transition_out": None,
        "sort_order": 0, "wait_points": [],
        "subtitle_track": None,
    }


# ---------------------------------------------------------------- scene 2
def scene_specs():
    objs = [obj("Specs Title", "Text", 120, 60, 600, 60, z=20,
                st=style(fill="#ffffff", font_size=48.0, font_weight=700),
                content="Technical Specifications")]

    rows = [("Weight", "weight"), ("Dimensions", "dimensions"),
            ("Material", "material"), ("Color", "color")]
    for i, (label, column) in enumerate(rows):
        y = 180 + i * 90
        objs.append(obj(f"Row {i + 1} Background", "Rect", 120, y, 900, 70,
                        z=10, st=style(fill="#1e293b", border_radius=6.0)))
        objs.append(obj(f"{label} Label", "Text", 140, y + 15, 200, 40, z=11,
                        st=style(fill="#94a3b8", font_size=22.0),
                        content=label))
        objs.append(obj(f"{label} Value", "Text", 500, y + 15, 500, 40, z=12,
                        st=style(fill="#ffffff", font_size=22.0,
                                 font_weight=600),
                        content=f"{{{{{column}}}}}",
                        bindings=[bind("content", column)],
                        appear=500 + i * 250))

    # The same plate as the hero, pushed back behind the spec rows: blurred and
    # dimmed so it reads as a backdrop rather than competing with the numbers.
    objs.append(obj(
        "Spec Backdrop", "Image", 1120, 180, 700, 525, z=1,
        content="images/x500.png",
        bindings=[bind("content", "image_file",
                       {"type": "ImagePath", "prefix": "images/"})],
        filters={"blur": 6.0, "brightness": 0.45, "contrast": 0.9,
                 "saturate": 0.6, "hue_rotate": None, "grayscale": None,
                 "sepia": None, "drop_shadow": None}))

    objs.append(obj("Back Button", "Button", 120, 600, 180, 50, z=15,
                    st=style(fill="#374151", font_size=20.0,
                             border_radius=8.0),
                    content="← Back"))
    objs.append(obj("Order Button", "Button", 340, 600, 200, 50, z=15,
                    st=style(fill="#7c3aed", font_size=20.0, font_weight=600,
                             border_radius=8.0),
                    content="Order →"))

    return {
        "id": uid(), "name": "Specifications", "duration_ms": 8000,
        "background": {"fill": "#111827", "gradient": None, "image": None},
        "objects": objs,
        "transition_in": {"kind": "SlideLeft", "duration_ms": 400},
        "transition_out": None,
        "sort_order": 1, "wait_points": [],
        "subtitle_track": None,
    }


# ---------------------------------------------------------------- scene 3
def scene_cta():
    objs = [
        obj("Order Now", "Text", 510, 300, 900, 100, z=10,
            st=style(fill="#ffffff", font_size=80.0, font_weight=700,
                     text_align="Center"),
            content="Order Now",
            keyframes=[kf(0, "transform.opacity", 0.0),
                       kf(400, "transform.opacity", 1.0)]),

        obj("CTA Product Name", "Text", 510, 420, 900, 50, z=9,
            st=style(fill="#a78bfa", font_size=34.0, text_align="Center"),
            content="{{product_name}}",
            bindings=[bind("content", "product_name")]),

        obj("CTA Price", "Text", 510, 490, 900, 50, z=8,
            st=style(fill="#22c55e", font_size=34.0, font_weight=600,
                     text_align="Center"),
            content="{{price}}",
            bindings=[bind("content", "price_eur",
                           {"type": "FormatCurrency",
                            "symbol": "€", "decimals": 2})]),

        # Only shown when the product cannot ship immediately, so the buyer sees
        # the wait before they commit rather than after.
        obj("Lead Time Note", "Text", 510, 545, 900, 40, z=8,
            st=style(fill="#fbbf24", font_size=24.0, text_align="Center"),
            content="{{lead_time}}",
            bindings=[bind("content", "lead_time")],
            condition=cond("lead_time", "NotEmpty")),

        obj("Contact Button", "Button", 810, 620, 300, 56, z=11,
            st=style(fill="#22c55e", font_size=24.0, font_weight=600,
                     border_radius=28.0),
            content="Contact Sales"),
    ]

    return {
        "id": uid(), "name": "Call to Action", "duration_ms": 5000,
        "background": {
            "fill": "#0a0a1a",
            "gradient": {
                "gradient_type": "Radial", "angle": 0.0,
                "stops": [{"offset": 0.0, "color": "#1e1b4b"},
                          {"offset": 1.0, "color": "#0a0a1a"}],
            },
            "image": None,
        },
        "objects": objs,
        "transition_in": {"kind": "Crossfade", "duration_ms": 500},
        "transition_out": None,
        "sort_order": 2, "wait_points": [],
        "subtitle_track": None,
    }


def main():
    project = {
        "version": "1.0",
        "meta": {"name": "Product Showcase", "width": 1920, "height": 1080,
                 "fps": 30, "created": "2026-09-20T00:00:00Z",
                 "modified": "2026-09-26T00:00:00Z"},
        "scenes": [scene_hero(), scene_specs(), scene_cta()],
        "effects_library": [],
        # The project carries its own source, so opening it in the editor
        # connects straight to the data it was designed against.
        "data_source": {
            "source_type": "Csv",
            "connection": "sample-products.csv",
            "table": "data",
            "preview_row": 0,
        },
        "export_settings": {"format": "Html", "single_file": True,
                            "autoplay": False, "loop_playback": False},
    }
    PROJECT.write_text(json.dumps(project, indent=2) + "\n")

    n_obj = sum(len(s["objects"]) for s in project["scenes"])
    n_bind = sum(len(o["data_bindings"]) for s in project["scenes"]
                 for o in s["objects"])
    n_cond = sum(1 for s in project["scenes"] for o in s["objects"]
                 if o.get("condition"))
    print(f"wrote {PROJECT.name}: {len(project['scenes'])} scenes, "
          f"{n_obj} objects, {n_bind} bindings, {n_cond} conditions")


if __name__ == "__main__":
    main()
