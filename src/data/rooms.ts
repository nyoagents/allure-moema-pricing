import type { Room } from "@/types";

export const ROOMS: Room[] = [
  {
    id: "standard",
    name: "Studio Standard",
    sqm: 20,
    maxGuests: 2,
    stayType: "both",
    description: "Sacada fechada, cama casal. Ideal para estadias curtas e longas.",
  },
  {
    id: "select",
    name: "Studio Select",
    sqm: 25,
    maxGuests: 2,
    stayType: "short",
    description: "Queen size, mesa de trabalho. O mais procurado para short stay.",
  },
  {
    id: "standard-garden",
    name: "Studio Standard Garden",
    sqm: 29,
    maxGuests: 2,
    stayType: "long",
    description: "Varanda estendida com vista para área verde.",
  },
  {
    id: "select-garden",
    name: "Studio Select Garden",
    sqm: 39,
    maxGuests: 2,
    stayType: "long",
    description: "Maior studio com varanda garden. Long stay premium.",
  },
  {
    id: "select-plus",
    name: "Studio Select Plus",
    sqm: 25,
    maxGuests: 2,
    stayType: "short",
    description: "Queen ou 2 camas solteiro. Flexibilidade de configuração.",
  },
  {
    id: "suite",
    name: "Suite",
    sqm: 50,
    maxGuests: 4,
    stayType: "long",
    description: "Queen + 2 solteiros. Para famílias ou estadias executivas longas.",
  },
];

export const ROOM_MAP = Object.fromEntries(ROOMS.map((r) => [r.id, r])) as Record<
  string,
  Room
>;

export const ROOM_IDS = ROOMS.map((r) => r.id);
