import FlowChartingPlugin from './plugin';
import grafana from './grafana_func';
import _ from 'lodash';

import * as gf from '../types/flowcharting';
declare var GFP: FlowChartingPlugin;

/**
 *
 *
 * @export
 * @class Metric
 */
export default class Metric {
  type = 'unknow';
  scopedVars: any;
  metrics: any = {};
  name = '';
  nullPointMode = 'connected';
  constructor(dataList: any) {}

  getName(): string {
    return this.name;
  }

  getValue(aggregator: gf.TAggregation, column?: string): string | number | null {
    return null;
  }

  getCoor(column?: string): gf.TGraphCoordinate[] {
    return [];
  }

  getColumnsName():string[] {
    return [];
  }
}

/**
 * Serie data
 *
 * @export
 * @class Serie
 * @extends {Metric}
 */
export class Serie extends Metric {
  constructor(dataList: any) {
    super(dataList);
    this.type = 'serie';
    this.name = dataList.alias;
    this.metrics = this.seriesHandler(dataList);
  }

  seriesHandler(seriesData) {
    const series = grafana.getTimeSeries(seriesData);
    series.flotpairs = series.getFlotPairs(this.nullPointMode);
    return series;
  }

  getValue(aggregator: gf.TAggregation): number | string | null {
    try {
      let value = this.metrics.stats[aggregator];
      if (value === undefined || value === null) {
        value = this.metrics.datapoints[this.metrics.datapoints.length - 1][0];
      }
      return value;
    } catch (error) {
      GFP.log.error('datapoint for serie is null', error);
      return null;
    }
  }

  getCoor(): gf.TGraphCoordinate[] {
    const result: gf.TGraphCoordinate[] = [];
    const datapoints = this.metrics.flotpairs;
    for (let index = 0; index < datapoints.length; index++) {
      result.push({
        x: datapoints[index][0],
        y: datapoints[index][1],
      });
    }
    return result;
  }

  getColumnsName():string[] {
    //TODO:
    return ["time","value"];
  }
}

/**
 * Table data
 *
 * @export
 * @class Table
 * @extends {Metric}
 */
export class Table extends Metric {
  tableColumnOptions!: any;
  tableColumn = '';
  allIsNull!: boolean;
  allIsZero!: boolean;
  constructor(dataList: any) {
    super(dataList);
    this.type = 'table';
    this.name = dataList.refId;
    this.metrics = this.tableHandler(dataList);
    
  }

  tableHandler(tableData: any) {
    const table: any = {
      datapoints: [],
      columnNames: {},
      stats: {},
    };

    // index columns {0: "Time", 1: "Value", 2: "Min", 3: "Max", 4: "Info"}
    tableData.columns.forEach((column, columnIndex) => {
      table.columnNames[columnIndex] = column.text;
      if (column.text.toString().toLowerCase() === 'time') {
        table.timeIndex = columnIndex;
        table.timeColumn = column.text;
      }
    });

    this.tableColumnOptions = table.columnNames;
    if (!_.find(tableData.columns, ['text', this.tableColumn])) {
      this.setTableColumnToSensibleDefault(tableData);
    }

    tableData.rows.forEach(row => {
      const datapoint = {};
      row.forEach((value, columnIndex) => {
        const key = table.columnNames[columnIndex];
        datapoint[key] = value;
      });
      table.datapoints.push(datapoint);
    });
    this.metrics.flotpairs = this.getFlotPairs(this.nullPointMode, table);
    return table;
  }
  setTableColumnToSensibleDefault(tableData) {
    if (tableData.columns.length === 1) {
      this.tableColumn = tableData.columns[0].text;
    } else {
      this.tableColumn = _.find(tableData.columns, col => {
        return col.type !== 'time';
      }).text;
    }
  }

  getFlotPairs(fillStyle: string, table: any) {
    const result = Array();
    const ignoreNulls = fillStyle === 'connected';
    const nullAsZero = fillStyle === 'null as zero';
    table.allIsNull = true;
    table.allIsZero = true;

    for (let idx in table.columnNames) {
      // let index = Number(idx);
      // if (table.timeIndex !== undefined && table.timeIndex !== null && index === table.timeIndex) continue;
      const currName = table.columnNames[idx];
      table.stats[currName] = {};
      table.stats[currName].name = currName;
      table.stats[currName].total = 0;
      table.stats[currName].max = -Number.MAX_VALUE;
      table.stats[currName].min = Number.MAX_VALUE;
      table.stats[currName].logmin = Number.MAX_VALUE;
      table.stats[currName].avg = null;
      table.stats[currName].current = null;
      table.stats[currName].first = null;
      table.stats[currName].delta = 0;
      table.stats[currName].diff = null;
      table.stats[currName].range = null;
      table.stats[currName].timeStep = Number.MAX_VALUE;

      let currentTime: any;
      let currentValue: any;
      let nonNulls = 0;
      let previousTime;
      let previousValue = 0;
      let previousDeltaUp = true;

      for (let i = 0; i < table.datapoints.length; i++) {
        if (table.timeColumn) currentTime = table.datapoints[i][table.timeColumn];
        currentValue = table.datapoints[i][currName];

        // Due to missing values we could have different timeStep all along the series
        // so we have to find the minimum one (could occur with aggregators such as ZimSum)
        if (previousTime !== undefined) {
          const timeStep = currentTime - previousTime;
          if (timeStep < table.stats[currName].timeStep) {
            table.stats[currName].timeStep = timeStep;
          }
        }
        previousTime = currentTime;

        if (currentValue === null) {
          if (ignoreNulls) {
            continue;
          }
          if (nullAsZero) {
            currentValue = 0;
          }
        }

        if (currentValue !== null) {
          if (_.isNumber(currentValue)) {
            table.stats[currName].total += currentValue;
            this.allIsNull = false;
            nonNulls++;
          }

          if (currentValue > table.stats[currName].max) {
            table.stats[currName].max = currentValue;
          }

          if (currentValue < table.stats[currName].min) {
            table.stats[currName].min = currentValue;
          }

          if (table.stats[currName].first === null) {
            table.stats[currName].first = currentValue;
          } else {
            if (previousValue > currentValue) {
              // counter reset
              previousDeltaUp = false;
              if (i === table.datapoints.length - 1) {
                // reset on last
                table.stats[currName].delta += currentValue;
              }
            } else {
              if (previousDeltaUp) {
                table.stats[currName].delta += currentValue - previousValue; // normal increment
              } else {
                table.stats[currName].delta += currentValue; // account for counter reset
              }
              previousDeltaUp = true;
            }
          }
          previousValue = currentValue;

          if (currentValue < table.stats[currName].logmin && currentValue > 0) {
            table.stats[currName].logmin = currentValue;
          }

          if (currentValue !== 0) {
            this.allIsZero = false;
          }
        }
        result.push([currentTime, currentValue]);
      }

      if (table.stats[currName].max === -Number.MAX_VALUE) {
        table.stats[currName].max = null;
      }
      if (table.stats[currName].min === Number.MAX_VALUE) {
        table.stats[currName].min = null;
      }

      if (result.length && !this.allIsNull) {
        table.stats[currName].avg = table.stats[currName].total / nonNulls;
        table.stats[currName].current = result[result.length - 1][1];
        if (table.stats[currName].current === null && result.length > 1) {
          table.stats[currName].current = result[result.length - 2][1];
        }
      }
      if (table.stats[currName].max !== null && table.stats[currName].min !== null) {
        table.stats[currName].range = table.stats[currName].max - table.stats[currName].min;
      }
      if (table.stats[currName].current !== null && table.stats[currName].first !== null) {
        table.stats[currName].diff = table.stats[currName].current - table.stats[currName].first;
      }

      table.stats[currName].count = result.length;
    }
    return result;
  }

  getValue(aggregator: gf.TAggregation, column: string): string | number | null {
    try {
      let value = this.metrics.stats[column][aggregator];
      if (value === undefined || value === null) {
        value = this.metrics.datapoints[this.metrics.datapoints.length - 1][column];
      }
      return value;
    } catch (error) {
      GFP.log.error('datapoint for table is null', error);
      return null;
    }
  }

  getColumnIndex(column: string): number | null {
    for (let idx in this.tableColumnOptions) {
      if (column === this.tableColumnOptions[idx]) return Number(idx);
    }
    return null;
  }

  getColumnsName(): string[] {
    const result: string[] = [];
    for (let idx in this.tableColumnOptions) {
      result.push(this.tableColumnOptions[idx]);
    }
    return result;
  }

  getCoor(column: string): gf.TGraphCoordinate[] {
    const result: gf.TGraphCoordinate[] = [];
    const datapoints = this.metrics.datapoints;
    for (let index = 0; index < datapoints.length; index++) {
      let coor:gf.TGraphCoordinate = { y : datapoints[index][column] }
      if (this.metrics.timeColumn) coor.x = datapoints[index][this.metrics.timeColumn]
      result.push(coor);
    }
    return result;
  }
}