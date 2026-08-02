export async function loadPuzzles(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load puzzles from ${url}: ${response.status}`);
  }
  return response.json();
}
