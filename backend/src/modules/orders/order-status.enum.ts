export enum OrderStatus {
  Open = 'open',
  Accepted = 'accepted',
  DriverEnRoute = 'driver_en_route',
  Arrived = 'arrived',
  Waiting = 'waiting',
  Started = 'started',
  Completed = 'completed',
  Canceled = 'canceled',
}

export const ACTIVE_DRIVER_ORDER_STATUSES = [
  OrderStatus.Accepted,
  OrderStatus.DriverEnRoute,
  OrderStatus.Arrived,
  OrderStatus.Waiting,
  OrderStatus.Started,
] as const;
