'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class EventLog extends Model {}
  EventLog.init({
    topic: DataTypes.STRING,
    event_type: DataTypes.STRING,
    timestamp: DataTypes.DATE,     // ISO8601
    url: DataTypes.STRING,
    request_id: DataTypes.UUID,     // uuid v4
    group_id: DataTypes.STRING,
    origin: DataTypes.INTEGER,
    operation: DataTypes.STRING,
    status: DataTypes.STRING,
    reason: DataTypes.STRING,
    raw: DataTypes.JSONB,    // mensaje completo como JSON
  }, {
    sequelize,
    modelName: 'EventLog',
  });
  return EventLog;
};
