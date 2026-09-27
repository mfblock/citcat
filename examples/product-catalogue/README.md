# Product Catalogue Example

One template, five products, five finished pages. This is the example that
exercises CitCat's data binding from end to end — the project carries its own
data source, so it is wired up the moment you open it.

## Files

| | |
|---|---|
| `product-showcase.citcat` | the template, bound to the CSV |
| `product-showcase-sqlite.citcat` | the same template against SQLite |
| `sample-products.csv` | five industrial laundry machines |
| `products.sqlite` | the same five rows, generated from the CSV |
| `images/` | one plate per product |

The `.citcat` files, the SQLite database and the images are all generated —
`_build.py`, `_gen_sqlite.py` and `_gen_assets.py` — so a column rename cannot
leave the project pointing at nothing.

## Run it

From this directory:

```bash
citcat-cli batch product-showcase.citcat ./out \
  --db sample-products.csv --single-file --name-column sku
```

Five self-contained HTML files, one per row, each named by its article number
and carrying its own product image embedded as base64.

The SQLite variant is the same command against the other source:

```bash
citcat-cli batch product-showcase-sqlite.citcat ./out-sqlite \
  --db products.sqlite --table products --single-file --name-column sku
```

`--db` is currently required even though the project declares its own
`data_source`.

## In the editor

1. Open `product-showcase.citcat`
2. Click **Data**, connect to `sample-products.csv`
3. Step the preview row — the canvas redraws with each product's data, and the
   conditional badges appear and disappear as you go
4. **Export** → *Export all rows*

## What it demonstrates

**Data binding.** Fourteen bindings across three scenes. Text content, and the
image path, resolve per row.

**All four bind transforms.**
- `None` — description, specifications
- `Uppercase` — the category line
- `Lowercase` — article numbers, stored upper-case in the data and printed
  lower-case in this catalogue's house style
- `FormatCurrency` — `price_eur` is a bare number in the data; the euro sign and
  the decimals are applied at render
- `ImagePath` — bare file names in the data, resolved against `images/`

**Conditional visibility, all seven operators.** The badge row under the hero is
driven entirely by the data:

| badge | condition |
|---|---|
| PREMIUM | `tier` **Equals** `premium` |
| STANDARD RANGE | `tier` **NotEquals** `premium` |
| LOW STOCK | `stock` **LessThan** `5` |
| IN STOCK | `stock` **GreaterThan** `50` |
| MADE TO ORDER | `lead_time` **NotEmpty** |
| SHIPS FROM STOCK | `lead_time` **Empty** |
| ENERGY SAVING | `description` **Contains** `energy` |

**Filters.** The specifications scene puts the product plate behind the rows,
blurred and dimmed, so it reads as a backdrop rather than competing with the
numbers.

Plus scene transitions, wait points, entrance effects, staggered reveals with
`appear_at_ms`, and gradient backgrounds.

## A note on where binding happens

Bindings and conditions are resolved by the **exporter**, and separately by the
**editor** for its preview. The browser runtime does not resolve them — so a raw
`.citcat` opened in an embed shows the literal `{{placeholder}}` text, while
exported output does not. Export, or use the editor's preview stepper.
