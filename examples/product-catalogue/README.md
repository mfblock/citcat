# Product Catalogue Example

Demonstrates CitCat's data binding and batch export.

## How to use

1. Open `product-showcase.citcat` in CitCat
2. Click the Data button in the toolbar
3. Connect to `sample-products.csv` (CSV source)
4. The template fields ({{product_name}}, {{price}}, etc.) will resolve to real data
5. Step through rows to preview each product
6. Export > check "Export all rows" > choose a folder
7. Get 5 individual HTML5 product pages

## What it demonstrates

- **Data binding** — text objects bound to CSV columns
- **Batch export** — one page per product row
- **Scene transitions** — SlideLeft and Crossfade between scenes
- **Wait points** — Scene 1 waits for button click before advancing
- **Entrance effects** — fade in, slide in, scale up on product details
- **Staggered reveals** — spec rows appear one by one using appear_at_ms
- **Background gradients** — linear and radial gradients
