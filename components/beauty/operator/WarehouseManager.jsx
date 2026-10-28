"use client";
// The warehouse screen of this panel: the shared WarehousePanel wired to THIS panel's own server actions.
import WarehousePanel from "@/components/operator/warehouse/WarehousePanel";
import { postMovement, reverseMovement, reserveStock, releaseReservation, createLocation, updateLocation, updateLot, setMinLevel, startCount, saveCounted, addCountLine, cancelCount, closeCount, exportStockCsv, exportMovementsCsv, exportCountCsv } from "@/lib/beauty/operator/warehouseActions";

const actions = { postMovement, reverseMovement, reserveStock, releaseReservation, createLocation, updateLocation, updateLot, setMinLevel, startCount, saveCounted, addCountLine, cancelCount, closeCount, exportStockCsv, exportMovementsCsv, exportCountCsv };

export default function WarehouseManager({ data }) {
  return <WarehousePanel data={data} actions={actions} base="/beauty/operator/warehouse" />;
}
