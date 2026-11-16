// Builds the sample grids from /images.json, which scripts/serve-demo.mjs generates from the
// files in demo/images/<section>/. File names are shown as captions using textContent.
(async () => {
  const status = document.getElementById('status');
  try {
    const listing = await (await fetch('images.json')).json();
    let total = 0;
    for (const grid of document.querySelectorAll('.grid')) {
      const section = grid.dataset.section;
      const files = listing[section] ?? [];
      total += files.length;
      if (files.length === 0) {
        const empty = document.createElement('p');
        empty.className = 'empty';
        empty.textContent = `No samples yet. Add image files to demo/images/${section}/.`;
        grid.append(empty);
        continue;
      }
      for (const file of files) {
        const figure = document.createElement('figure');
        const image = new Image();
        image.src = `images/${section}/${encodeURIComponent(file)}`;
        image.alt = '';
        image.loading = 'eager';
        const caption = document.createElement('figcaption');
        caption.textContent = file.replace(/\.[a-z]+$/i, '').replace(/[-_]+/g, ' ');
        figure.append(image, caption);
        grid.append(figure);
      }
    }
    status.textContent = `${total} sample images.`;
  } catch {
    status.textContent = 'Could not load the sample list. Start the page with "npm run demo".';
  }
})();
