import { Router, type IRouter } from "express";
import healthRouter from "./health";
import usersRouter from "./users";
import teachersRouter from "./teachers";
import studentsRouter from "./students";
import listingsRouter from "./listings";
import masterclassesRouter from "./masterclasses";
import eventsRouter from "./events";
import digitalProductsRouter from "./digitalProducts";
import bookingsRouter from "./bookings";
import ordersRouter from "./orders";
import reviewsRouter from "./reviews";
import dashboardRouter from "./dashboard";
import stripeRouter from "./stripe";
import storageRouter from "./storage";
import reelsRouter from "./reels";

const router: IRouter = Router();

router.use(healthRouter);
router.use(storageRouter);
router.use(usersRouter);
router.use(teachersRouter);
router.use(studentsRouter);
router.use(listingsRouter);
router.use(masterclassesRouter);
router.use(eventsRouter);
router.use(digitalProductsRouter);
router.use(bookingsRouter);
router.use(ordersRouter);
router.use(reviewsRouter);
router.use(dashboardRouter);
router.use(stripeRouter);
router.use(reelsRouter);

export default router;
