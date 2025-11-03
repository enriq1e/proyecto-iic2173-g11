'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class PurchaseIntent extends Model {
    static associate(models) {
      // cada intento pertenece a UNA propiedad
      PurchaseIntent.belongsTo(models.Propertie, {
        foreignKey: 'propertieId',
        as: 'propertie',
      });
    }
  }
  PurchaseIntent.init({
    request_id:     { type: DataTypes.STRING, allowNull: false, unique: true },
    group_id:       { type: DataTypes.STRING, allowNull: false },
    url:            { type: DataTypes.STRING, allowNull: false },
    origin:         { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    operation:      { type: DataTypes.STRING, allowNull: false, defaultValue: 'BUY' },
    status:         { type: DataTypes.STRING, allowNull: false, defaultValue: 'PENDING' },
    price_amount:   { type: DataTypes.DECIMAL(18,2), allowNull: false },
    price_currency: { type: DataTypes.STRING, allowNull: false, defaultValue: 'CLP' },
    email:          { type: DataTypes.STRING, allowNull: false },

    propertieId:    { type: DataTypes.INTEGER, allowNull: false },
    receipt_url:    { type: DataTypes.STRING, allowNull: true },
  }, {
    sequelize,
    modelName: 'PurchaseIntent',
  });
  return PurchaseIntent;
};
