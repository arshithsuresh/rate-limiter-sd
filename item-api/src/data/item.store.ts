import { randomUUID } from "node:crypto";
import { Item } from "../models/item.model";

export let items: Item[] = [
  {
    id: randomUUID(),
    name: "Test Items",
  },
];
