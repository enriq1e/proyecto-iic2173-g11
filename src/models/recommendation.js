'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Recommendation extends Model {
    static associate(models) {
    }
  }

  Recommendation.init({
    userId: { type: DataTypes.STRING, allowNull: false },
    basePropertyId: { type: DataTypes.INTEGER, allowNull: false },
    recommendationIds: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
  }, {
    sequelize,
    modelName: 'Recommendation',
  });

  return Recommendation;
};
