import { Sequelize, DataTypes } from "sequelize";
import dotenv from "dotenv";

dotenv.config();

// Crear conexión usando variables de entorno
export const sequelize = new Sequelize(
  process.env.DB_NAME,
  process.env.DB_USER,
  process.env.DB_PASS,
  {
    host: process.env.DB_HOST,
    dialect: "postgres"
  }
);

// Modelo Property
export const Property = sequelize.define("Property", {
  name: { type: DataTypes.STRING },
  price: { type: DataTypes.FLOAT },
  currency: { type: DataTypes.STRING },
  bedrooms: { type: DataTypes.STRING },
  bathrooms: { type: DataTypes.STRING },
  m2: { type: DataTypes.STRING },
  location: { type: DataTypes.STRING },
  img: { type: DataTypes.STRING },
  url: { type: DataTypes.STRING },
  is_project: { type: DataTypes.BOOLEAN },
  offers: { type: DataTypes.INTEGER },
  timestamp: { type: DataTypes.DATE },
});

// Función para testear la conexión
export async function InitDB() {
  try {
    await sequelize.authenticate();
    console.log("Conexion con la base de datos establecida.");
    await sequelize.sync();
    console.log("Tablas sincronizadas.");
  } catch (err) {
    console.error("Error conectando a la DB:", err);
  }
}
