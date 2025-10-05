'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Propertie extends Model {
    static associate(models) {
      // 1 Propertie tiene muchos PurchaseIntent (FK: propertieId)
      Propertie.hasMany(models.PurchaseIntent, {
        foreignKey: 'propertieId',
        as: 'purchaseIntents',
      });
    }
  }
  Propertie.init({
    name: DataTypes.STRING,
    price: DataTypes.FLOAT,
    currency: DataTypes.STRING,
    bedrooms: DataTypes.STRING,
    bathrooms: DataTypes.STRING,
    m2: DataTypes.STRING,
    location: DataTypes.STRING,
    img: DataTypes.STRING,
    url: DataTypes.STRING,
    is_project: DataTypes.BOOLEAN,
    timestamp: DataTypes.DATE,
    offers: DataTypes.INTEGER
  }, {
    sequelize,
    modelName: 'Propertie',
  });
  return Propertie;
};
