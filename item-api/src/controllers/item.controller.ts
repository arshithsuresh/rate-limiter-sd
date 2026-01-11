import { Request, Response, NextFunction } from "express";
import { Item } from "../models/item.model";
import { items } from "../data/item.store";
import { randomUUID } from "node:crypto";

export const createItem = (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name } = req.body;
    console.log(name);
    const item: Item = { id: randomUUID(), name };
    items.push(item);
    res.status(201).json(item);
  } catch (error) {
    console.log("ERROR");
    next(error);
  }
};

export const getItems = (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(items);
  } catch (error) {
    next(error);
  }
};
