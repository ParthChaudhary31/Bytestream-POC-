import { DataTypes, Model, Optional, Sequelize } from 'sequelize';

export interface IHubLedger {
  id?: number;
  userAddress: string; // User's address
  balance: number; // User's balance in Hub's internal ledger (sats)
  channelId: string; // Associated channel ID
  lastUpdated?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

interface HubLedgerCreationAttributes extends Optional<IHubLedger, 'id' | 'createdAt' | 'updatedAt' | 'lastUpdated'> {}

export class HubLedger extends Model<IHubLedger, HubLedgerCreationAttributes> implements IHubLedger {
  public id!: number;
  public userAddress!: string;
  public balance!: number;
  public channelId!: string;
  public lastUpdated?: Date;
  public createdAt!: Date;
  public updatedAt!: Date;
}

export const initHubLedger = (sequelize: Sequelize): typeof HubLedger => {
  HubLedger.init(
    {
      id: {
        type: DataTypes.INTEGER.UNSIGNED,
        autoIncrement: true,
        primaryKey: true,
      },
      userAddress: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      balance: {
        type: DataTypes.BIGINT,
        allowNull: false,
        defaultValue: 0,
      },
      channelId: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      lastUpdated: {
        type: DataTypes.DATE,
        allowNull: true,
      },
    },
    {
      sequelize,
      tableName: 'hub_ledger',
      timestamps: true,
      indexes: [
        {
          unique: true,
          fields: ['userAddress'],
        },
        {
          fields: ['channelId'],
        },
        {
          fields: ['lastUpdated'],
        },
      ],
    }
  );
  return HubLedger;
};

