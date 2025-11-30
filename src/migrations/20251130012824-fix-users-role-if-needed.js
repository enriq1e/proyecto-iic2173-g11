'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Comprobar si existe la columna antes de crearla
    const table = await queryInterface.describeTable('Users');

    if (!table.role) {
      return queryInterface.addColumn('Users', 'role', {
        type: Sequelize.STRING,
        allowNull: false,
        defaultValue: 'user',
      });
    }

    // Si ya existe, no hacer nada
    return Promise.resolve();
  },

  async down(queryInterface) {
    // Solo eliminar si existe
    const table = await queryInterface.describeTable('Users');

    if (table.role) {
      return queryInterface.removeColumn('Users', 'role');
    }

    return Promise.resolve();
  }
};
