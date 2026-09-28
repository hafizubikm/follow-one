export interface Vec {
  x: number;
  y: number;
}

export function length(x: number, y: number): number {
  return Math.sqrt(x * x + y * y);
}

export function randomUnit(random: () => number = Math.random): Vec {
  const angle = random() * 2 * Math.PI;
  return { x: Math.cos(angle), y: Math.sin(angle) };
}
