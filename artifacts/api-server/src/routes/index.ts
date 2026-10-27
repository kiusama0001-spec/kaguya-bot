import { Router, type IRouter } from "express";
import healthRouter from "./health";
import kaguyaRouter from "./kaguya";

const router: IRouter = Router();

router.use(healthRouter);
router.use(kaguyaRouter);

export default router;
