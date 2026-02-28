import { z, router, publicProcedure } from './_shared';
import { assetNodeService, measurementPointService, assetSensorService } from '../../services/database/asset.service';

export const assetRouter = router({
  // --- 资产节点（设备树） ---
  getTree: publicProcedure
    .input(z.object({
      level: z.number().optional(),
      rootNodeId: z.string().optional(),
      status: z.string().optional(),
      search: z.string().optional(),
    }).optional())
    .query(({ input }) => assetNodeService.getTree(input ?? undefined)),

  getNode: publicProcedure
    .input(z.object({ nodeId: z.string() }))
    .query(({ input }) => assetNodeService.getById(input.nodeId)),

  getChildren: publicProcedure
    .input(z.object({ parentNodeId: z.string() }))
    .query(({ input }) => assetNodeService.getChildren(input.parentNodeId)),

  createNode: publicProcedure
    .input(z.object({
      nodeId: z.string().min(1).max(64),
      code: z.string().min(1).max(100),
      name: z.string().min(1).max(200),
      level: z.number().int().min(1).max(10),
      nodeType: z.string().min(1).max(20),
      parentNodeId: z.string().optional(),
      rootNodeId: z.string().min(1),
      templateCode: z.string().optional(),
      path: z.string().min(1),
      serialNumber: z.string().optional(),
      location: z.string().optional(),
      department: z.string().optional(),
      installDate: z.string().optional(),
      attributes: z.any().optional(),
    }))
    .mutation(({ input }) => assetNodeService.create(input)),

  updateNode: publicProcedure
    .input(z.object({
      nodeId: z.string(),
      name: z.string().optional(),
      status: z.string().optional(),
      location: z.string().optional(),
      department: z.string().optional(),
      serialNumber: z.string().optional(),
      attributes: z.any().optional(),
    }))
    .mutation(({ input }) => {
      const { nodeId, ...data } = input;
      return assetNodeService.update(nodeId, data);
    }),

  deleteNode: publicProcedure
    .input(z.object({ nodeId: z.string() }))
    .mutation(({ input }) => assetNodeService.delete(input.nodeId)),

  getStats: publicProcedure
    .query(() => assetNodeService.getStats()),

  // --- 测点 ---
  listMeasurementPoints: publicProcedure
    .input(z.object({
      nodeId: z.string().optional(),
      deviceCode: z.string().optional(),
      measurementType: z.string().optional(),
    }).optional())
    .query(({ input }) => measurementPointService.list(input ?? undefined)),

  getMeasurementPoint: publicProcedure
    .input(z.object({ mpId: z.string() }))
    .query(({ input }) => measurementPointService.getById(input.mpId)),

  createMeasurementPoint: publicProcedure
    .input(z.object({
      mpId: z.string().min(1).max(64),
      nodeId: z.string().min(1),
      deviceCode: z.string().min(1),
      templateCode: z.string().optional(),
      name: z.string().min(1).max(100),
      position: z.string().optional(),
      measurementType: z.string().min(1),
      warningThreshold: z.number().optional(),
      criticalThreshold: z.number().optional(),
    }))
    .mutation(({ input }) => measurementPointService.create(input)),

  updateMeasurementPoint: publicProcedure
    .input(z.object({
      mpId: z.string(),
      name: z.string().optional(),
      position: z.string().optional(),
      warningThreshold: z.number().optional(),
      criticalThreshold: z.number().optional(),
    }))
    .mutation(({ input }) => {
      const { mpId, ...data } = input;
      return measurementPointService.update(mpId, data);
    }),

  deleteMeasurementPoint: publicProcedure
    .input(z.object({ mpId: z.string() }))
    .mutation(({ input }) => measurementPointService.delete(input.mpId)),

  // --- 传感器 ---
  listSensors: publicProcedure
    .input(z.object({
      deviceCode: z.string().optional(),
      mpId: z.string().optional(),
      status: z.string().optional(),
    }).optional())
    .query(({ input }) => assetSensorService.list(input ?? undefined)),

  getSensor: publicProcedure
    .input(z.object({ deviceCode: z.string(), sensorId: z.string() }))
    .query(({ input }) => assetSensorService.getById(input.deviceCode, input.sensorId)),

  createSensor: publicProcedure
    .input(z.object({
      deviceCode: z.string().min(1),
      sensorId: z.string().min(1),
      mpId: z.string().min(1),
      name: z.string().optional(),
      channel: z.string().optional(),
      sampleRate: z.number().optional(),
      physicalQuantity: z.string().optional(),
      unit: z.string().optional(),
      warningThreshold: z.number().optional(),
      criticalThreshold: z.number().optional(),
      manufacturer: z.string().optional(),
      model: z.string().optional(),
      serialNumber: z.string().optional(),
      installDate: z.string().optional(),
      calibrationDate: z.string().optional(),
    }))
    .mutation(({ input }) => assetSensorService.create(input)),

  updateSensor: publicProcedure
    .input(z.object({
      deviceCode: z.string(),
      sensorId: z.string(),
      name: z.string().optional(),
      status: z.string().optional(),
      sampleRate: z.number().optional(),
      warningThreshold: z.number().optional(),
      criticalThreshold: z.number().optional(),
    }))
    .mutation(({ input }) => {
      const { deviceCode, sensorId, ...data } = input;
      return assetSensorService.update(deviceCode, sensorId, data);
    }),

  deleteSensor: publicProcedure
    .input(z.object({ deviceCode: z.string(), sensorId: z.string() }))
    .mutation(({ input }) => assetSensorService.delete(input.deviceCode, input.sensorId)),
});
