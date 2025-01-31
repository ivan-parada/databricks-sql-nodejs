import { stringify, NIL, parse } from 'uuid';
import {
  TSessionHandle,
  TStatus,
  TOperationHandle,
  TSparkDirectResults,
  TSparkArrowTypes,
} from '../thrift/TCLIService_types';
import HiveDriver from './hive/HiveDriver';
import { Int64 } from './hive/Types';
import IDBSQLSession, {
  ExecuteStatementOptions,
  TypeInfoRequest,
  CatalogsRequest,
  SchemasRequest,
  TablesRequest,
  TableTypesRequest,
  ColumnsRequest,
  FunctionsRequest,
  PrimaryKeysRequest,
  CrossReferenceRequest,
} from './contracts/IDBSQLSession';
import IOperation from './contracts/IOperation';
import DBSQLOperation from './DBSQLOperation';
import Status from './dto/Status';
import InfoValue from './dto/InfoValue';
import { definedOrError } from './utils';
import IDBSQLLogger, { LogLevel } from './contracts/IDBSQLLogger';
import globalConfig from './globalConfig';

const defaultMaxRows = 100000;

interface OperationResponseShape {
  status: TStatus;
  operationHandle?: TOperationHandle;
  directResults?: TSparkDirectResults;
}

function getDirectResultsOptions(maxRows: number | null = defaultMaxRows) {
  if (maxRows === null) {
    return {};
  }

  return {
    getDirectResults: {
      maxRows: new Int64(maxRows),
    },
  };
}

function getArrowOptions(): {
  canReadArrowResult: boolean;
  useArrowNativeTypes?: TSparkArrowTypes;
} {
  const { arrowEnabled = true, useArrowNativeTypes = true } = globalConfig;

  if (!arrowEnabled) {
    return {
      canReadArrowResult: false,
    };
  }

  return {
    canReadArrowResult: true,
    useArrowNativeTypes: {
      timestampAsArrow: useArrowNativeTypes,
      decimalAsArrow: useArrowNativeTypes,
      complexTypesAsArrow: useArrowNativeTypes,
      // TODO: currently unsupported by `apache-arrow` (see https://github.com/streamlit/streamlit/issues/4489)
      intervalTypesAsArrow: false,
    },
  };
}

export default class DBSQLSession implements IDBSQLSession {
  private readonly driver: HiveDriver;

  private readonly sessionHandle: TSessionHandle;

  private readonly logger: IDBSQLLogger;

  constructor(driver: HiveDriver, sessionHandle: TSessionHandle, logger: IDBSQLLogger) {
    this.driver = driver;
    this.sessionHandle = sessionHandle;
    this.logger = logger;
    this.logger.log(LogLevel.debug, `Session created with id: ${this.getId()}`);
  }

  public getId() {
    return stringify(this.sessionHandle?.sessionId?.guid || parse(NIL));
  }

  /**
   * Fetches info
   * @public
   * @param infoType - One of the values TCLIService_types.TGetInfoType
   * @returns Value corresponding to info type requested
   * @example
   * const response = await session.getInfo(thrift.TCLIService_types.TGetInfoType.CLI_DBMS_VER);
   */
  public async getInfo(infoType: number): Promise<InfoValue> {
    const response = await this.driver.getInfo({
      sessionHandle: this.sessionHandle,
      infoType,
    });

    Status.assert(response.status);
    return new InfoValue(response.infoValue);
  }

  /**
   * Executes statement
   * @public
   * @param statement - SQL statement to be executed
   * @param options - maxRows field is used to specify Direct Results
   * @returns DBSQLOperation
   * @example
   * const operation = await session.executeStatement(query, { runAsync: true });
   */
  public async executeStatement(statement: string, options: ExecuteStatementOptions = {}): Promise<IOperation> {
    const response = await this.driver.executeStatement({
      sessionHandle: this.sessionHandle,
      statement,
      queryTimeout: options.queryTimeout,
      runAsync: options.runAsync || false,
      ...getDirectResultsOptions(options.maxRows),
      ...getArrowOptions(),
    });

    return this.createOperation(response);
  }

  /**
   * Information about supported data types
   * @public
   * @param request
   * @returns DBSQLOperation
   */
  public async getTypeInfo(request: TypeInfoRequest = {}): Promise<IOperation> {
    const response = await this.driver.getTypeInfo({
      sessionHandle: this.sessionHandle,
      runAsync: request.runAsync || false,
      ...getDirectResultsOptions(request.maxRows),
    });

    return this.createOperation(response);
  }

  /**
   * Get list of catalogs
   * @public
   * @param request
   * @returns DBSQLOperation
   */
  public async getCatalogs(request: CatalogsRequest = {}): Promise<IOperation> {
    const response = await this.driver.getCatalogs({
      sessionHandle: this.sessionHandle,
      runAsync: request.runAsync || false,
      ...getDirectResultsOptions(request.maxRows),
    });

    return this.createOperation(response);
  }

  /**
   * Get list of schemas
   * @public
   * @param request
   * @returns DBSQLOperation
   */
  public async getSchemas(request: SchemasRequest = {}): Promise<IOperation> {
    const response = await this.driver.getSchemas({
      sessionHandle: this.sessionHandle,
      catalogName: request.catalogName,
      schemaName: request.schemaName,
      runAsync: request.runAsync || false,
      ...getDirectResultsOptions(request.maxRows),
    });

    return this.createOperation(response);
  }

  /**
   * Get list of tables
   * @public
   * @param request
   * @returns DBSQLOperation
   */
  public async getTables(request: TablesRequest = {}): Promise<IOperation> {
    const response = await this.driver.getTables({
      sessionHandle: this.sessionHandle,
      catalogName: request.catalogName,
      schemaName: request.schemaName,
      tableName: request.tableName,
      tableTypes: request.tableTypes,
      runAsync: request.runAsync || false,
      ...getDirectResultsOptions(request.maxRows),
    });

    return this.createOperation(response);
  }

  /**
   * Get list of supported table types
   * @public
   * @param request
   * @returns DBSQLOperation
   */
  public async getTableTypes(request: TableTypesRequest = {}): Promise<IOperation> {
    const response = await this.driver.getTableTypes({
      sessionHandle: this.sessionHandle,
      runAsync: request.runAsync || false,
      ...getDirectResultsOptions(request.maxRows),
    });

    return this.createOperation(response);
  }

  /**
   * Get full information about columns of the table
   * @public
   * @param request
   * @returns DBSQLOperation
   */
  public async getColumns(request: ColumnsRequest = {}): Promise<IOperation> {
    const response = await this.driver.getColumns({
      sessionHandle: this.sessionHandle,
      catalogName: request.catalogName,
      schemaName: request.schemaName,
      tableName: request.tableName,
      columnName: request.columnName,
      runAsync: request.runAsync || false,
      ...getDirectResultsOptions(request.maxRows),
    });

    return this.createOperation(response);
  }

  /**
   * Get information about function
   * @public
   * @param request
   * @returns DBSQLOperation
   */
  public async getFunctions(request: FunctionsRequest): Promise<IOperation> {
    const response = await this.driver.getFunctions({
      sessionHandle: this.sessionHandle,
      catalogName: request.catalogName,
      schemaName: request.schemaName,
      functionName: request.functionName,
      runAsync: request.runAsync || false,
      ...getDirectResultsOptions(request.maxRows),
    });

    return this.createOperation(response);
  }

  public async getPrimaryKeys(request: PrimaryKeysRequest): Promise<IOperation> {
    const response = await this.driver.getPrimaryKeys({
      sessionHandle: this.sessionHandle,
      catalogName: request.catalogName,
      schemaName: request.schemaName,
      tableName: request.tableName,
      runAsync: request.runAsync || false,
      ...getDirectResultsOptions(request.maxRows),
    });

    return this.createOperation(response);
  }

  /**
   * Request information about foreign keys between two tables
   * @public
   * @param request
   * @returns DBSQLOperation
   */
  public async getCrossReference(request: CrossReferenceRequest): Promise<IOperation> {
    const response = await this.driver.getCrossReference({
      sessionHandle: this.sessionHandle,
      parentCatalogName: request.parentCatalogName,
      parentSchemaName: request.parentSchemaName,
      parentTableName: request.parentTableName,
      foreignCatalogName: request.foreignCatalogName,
      foreignSchemaName: request.foreignSchemaName,
      foreignTableName: request.foreignTableName,
      runAsync: request.runAsync || false,
      ...getDirectResultsOptions(request.maxRows),
    });

    return this.createOperation(response);
  }

  /**
   * Closes the session
   * @public
   * @returns Operation status
   */
  public async close(): Promise<Status> {
    const response = await this.driver.closeSession({
      sessionHandle: this.sessionHandle,
    });

    this.logger.log(LogLevel.debug, `Session closed with id: ${this.getId()}`);
    Status.assert(response.status);
    return new Status(response.status);
  }

  private createOperation(response: OperationResponseShape): IOperation {
    Status.assert(response.status);
    const handle = definedOrError(response.operationHandle);
    return new DBSQLOperation(this.driver, handle, this.logger, response.directResults);
  }
}
