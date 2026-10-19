// Remplaçant de next/link : un simple lien, pour rendre les composants serveur sans Next.js.
export default function Link(props: Record<string, unknown>) {
  return { type: "a", props, key: null };
}
