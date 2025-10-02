'use strict';
const {
  Model
} = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class Wallet extends Model {
    /**
     * Helper method for defining associations.
     * This method is not a part of Sequelize lifecycle.
     * The `models/index` file will call this method automatically.
     */
    static associate(models) {
      // define association here
    }
  }
  Wallet.init({
    email: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true
    },
    balance:  { type: DataTypes.DECIMAL(18,2), allowNull: false, defaultValue: 0 },
  }, {
    sequelize,
    modelName: 'Wallet',
  });
  return Wallet;
};