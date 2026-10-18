export interface InvitationData {
  event: { type: string; host_a: string; host_b: string; title: string; date: string; time: string; venue: string; address: string; dress: string; message: string; program: string; offer: string; short_id: string; photos: string[] };
  guest: { name: string; kind: string | null; seats: number; table: number | null; rsvp: "yes" | "no" | null; code: string; qr: string; entered_at: string | null };
  order: { drinks: string[]; dishes: string[] } | null;
  catalog: { id: string; kind: "drink" | "dish"; name: string }[];
}
