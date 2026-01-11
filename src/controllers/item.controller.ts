import { Request, Response, NextFunction } from "express";
import { Item } from "../models/item.model";
import { items } from "../data/item.store";

export const createItem = (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name } = req.body;
    const item: Item = { id: Date.now(), name };
  } catch (error) {
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
