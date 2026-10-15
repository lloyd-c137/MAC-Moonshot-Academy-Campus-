import type { RoomKind } from './campusModel3d';

/**
 * Room palette. `calm` is the everyday lunar tint; `strong` is used by the 空间 layer
 * so categories separate clearly. Orange is never used here: it marks selection and life.
 */
export const ROOM_KIND_STYLE: Record<RoomKind, { calm: number; strong: number; label: string }> = {
  classroom: { calm: 0xd6e1ec, strong: 0x9dbad6, label: '教室与书院' },
  lab: { calm: 0xcbe3e0, strong: 0x86c2bb, label: '实验与科创' },
  creative: { calm: 0xe5daed, strong: 0xc4a6d2, label: '艺术与创作' },
  library: { calm: 0xd9dcf1, strong: 0xa8afe0, label: '图书与阅读' },
  dining: { calm: 0xede2c6, strong: 0xe2c983, label: '餐厅' },
  meeting: { calm: 0xd8e7d1, strong: 0xa5cd96, label: '会议与研讨' },
  hall: { calm: 0xe9dbd0, strong: 0xd9b7a4, label: '多功能与活动' },
  office: { calm: 0xdde2e8, strong: 0xb5bdc9, label: '办公与服务' },
  service: { calm: 0xd2d7de, strong: 0xa0a8b4, label: '库房与设备' },
  restroom: { calm: 0xd4e4ee, strong: 0x8fb9d4, label: '卫生间' },
  stair: { calm: 0xd3d6dc, strong: 0x9ea4ae, label: '楼梯' },
  public: { calm: 0xe6e3dc, strong: 0xcfc6b3, label: '门厅与公共区' },
  garden: { calm: 0xd6e6d0, strong: 0x9fcb8f, label: '中庭花园' },
  room: { calm: 0xdce0e5, strong: 0xc2c8d0, label: '其他房间' },
};

