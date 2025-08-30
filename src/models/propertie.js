'use strict';

const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Propertie extends Model {
    /**
     * Helper method for defining associations.
     * This method is not a part of Sequelize lifecycle.
     * The `models/index` file will call this method automatically.
     */
    static associate(models) {
      // define association here
    }
  }
  Propertie.init({
    name: DataTypes.STRING,
    price: DataTypes.FLOAT,
    currency: DataTypes.STRING,
    bedrooms: DataTypes.STRING,
    m2: DataTypes.STRING,
    location: DataTypes.STRING,
    img: DataTypes.STRING,
    url: DataTypes.STRING,
    is_proyect: DataTypes.BOOLEAN,
    timestamp: DataTypes.DATE,
    offers: DataTypes.INTEGER
  }, {
    sequelize,
    modelName: 'Propertie',
  });
  return Propertie;
};
