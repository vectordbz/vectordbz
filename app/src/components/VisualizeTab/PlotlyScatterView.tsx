import React, { useMemo } from 'react';
import Plot from 'react-plotly.js';
import type { ProjectedPoint } from '../../types';

export interface PlotlyScatterViewProps {
  projectedPoints: ProjectedPoint[];
  dimension: 2 | 3;
  selectedPoint: ProjectedPoint | null;
  nearestNeighbors: Array<{ point: ProjectedPoint }>;
  getPointColor: (point: ProjectedPoint, index: number) => string;
  pointSize: number;
  onSelectPoint: (point: ProjectedPoint) => void | Promise<void>;
  theme: 'dark' | 'light';
}

const NEIGHBOR_LINE_COLOR = '#52c41a';

function getPointSize(
  point: ProjectedPoint,
  index: number,
  baseSize: number,
  selectedPoint: ProjectedPoint | null,
  nearestNeighbors: Array<{ point: ProjectedPoint }>,
  hoveredId: string | null,
): number {
  if (selectedPoint?.id === point.id) return baseSize + 4;
  if (hoveredId === point.id) return baseSize + 2;
  if (nearestNeighbors.some((n) => n.point.id === point.id)) return baseSize + 1;
  return baseSize;
}

export const PlotlyScatterView: React.FC<PlotlyScatterViewProps> = ({
  projectedPoints,
  dimension,
  selectedPoint,
  nearestNeighbors,
  getPointColor,
  pointSize,
  onSelectPoint,
  theme,
}) => {
  const isDark = theme === 'dark';

  const { data, layout, config } = useMemo(() => {
    const n = projectedPoints.length;
    if (n === 0) {
      return { data: [], layout: {}, config: {} };
    }

    const x = projectedPoints.map((p) => p.x);
    const y = projectedPoints.map((p) => p.y);
    const z = dimension === 3 ? projectedPoints.map((p) => p.z ?? 0) : undefined;
    const colors = projectedPoints.map((p, i) => getPointColor(p, i));
    const sizes = projectedPoints.map((p, i) =>
      getPointSize(p, i, pointSize, selectedPoint, nearestNeighbors, null),
    );
    const text = projectedPoints.map((p) => String(p.id));
    const customdata = projectedPoints.map((_, i) => i);

    const scatterTrace: Record<string, unknown> =
      dimension === 3
        ? {
            type: 'scatter3d',
            x,
            y,
            z: z!,
            mode: 'markers',
            marker: {
              size: sizes,
              color: colors,
              line: { width: 0 },
            },
            text,
            customdata,
            hoverinfo: 'text',
          }
        : {
            type: 'scatter',
            x,
            y,
            mode: 'markers',
            marker: {
              size: sizes,
              color: colors,
              line: { width: 0 },
            },
            text,
            customdata,
            hoverinfo: 'text',
          };

    const traces: Record<string, unknown>[] = [scatterTrace];

    // Neighbor lines: segment per neighbor [selected, neighbor, null, ...]
    if (selectedPoint && nearestNeighbors.length > 0) {
      const lineX: number[] = [];
      const lineY: number[] = [];
      const lineZ: number[] = [];
      nearestNeighbors.forEach(({ point: neighbor }) => {
        lineX.push(selectedPoint.x, neighbor.x, null as unknown as number);
        lineY.push(selectedPoint.y, neighbor.y, null as unknown as number);
        if (dimension === 3) {
          lineZ.push(selectedPoint.z ?? 0, neighbor.z ?? 0, null as unknown as number);
        }
      });
      if (dimension === 3) {
        traces.push({
          type: 'scatter3d',
          x: lineX,
          y: lineY,
          z: lineZ,
          mode: 'lines',
          line: { color: NEIGHBOR_LINE_COLOR, width: 2, dash: 'dash' },
          hoverinfo: 'skip',
        });
      } else {
        traces.push({
          type: 'scatter',
          x: lineX,
          y: lineY,
          mode: 'lines',
          line: { color: NEIGHBOR_LINE_COLOR, width: 2, dash: 'dash' },
          hoverinfo: 'skip',
        });
      }
    }

    const paperBg = isDark ? '#16161e' : '#ffffff';
    const fontColor = isDark ? '#e4e4e7' : '#1e293b';
    const gridColor = isDark ? '#3a3a4a' : '#e2e8f0';

    const layoutConfig: Record<string, unknown> =
      dimension === 3
        ? {
            paper_bgcolor: paperBg,
            plot_bgcolor: paperBg,
            font: { color: fontColor, size: 12 },
            margin: { t: 8, r: 8, b: 8, l: 8 },
            scene: {
              xaxis: {
                showgrid: true,
                gridcolor: gridColor,
                zeroline: false,
                title: '',
                showticklabels: false,
              },
              yaxis: {
                showgrid: true,
                gridcolor: gridColor,
                zeroline: false,
                title: '',
                showticklabels: false,
              },
              zaxis: {
                showgrid: true,
                gridcolor: gridColor,
                zeroline: false,
                title: '',
                showticklabels: false,
              },
              bgcolor: paperBg,
            },
            showlegend: false,
          }
        : {
            paper_bgcolor: paperBg,
            plot_bgcolor: paperBg,
            font: { color: fontColor, size: 12 },
            margin: { t: 8, r: 8, b: 8, l: 8 },
            xaxis: {
              showgrid: true,
              gridcolor: gridColor,
              zeroline: false,
              title: '',
              showticklabels: false,
            },
            yaxis: {
              showgrid: true,
              gridcolor: gridColor,
              zeroline: false,
              scaleanchor: 'x',
              title: '',
              showticklabels: false,
            },
            showlegend: false,
          };

    const configOptions: Record<string, unknown> = {
      responsive: true,
      displayModeBar: true,
      modeBarButtonsToRemove: ['lasso2d', 'select2d'],
      toImageButtonOptions: { format: 'png', pixelRatio: 2 },
    };

    return {
      data: traces,
      layout: layoutConfig,
      config: configOptions,
    };
  }, [
    projectedPoints,
    dimension,
    selectedPoint,
    nearestNeighbors,
    getPointColor,
    pointSize,
    isDark,
  ]);

  const handleClick = (event: {
    points?: Array<{ pointIndex?: number; customdata?: unknown }>;
  }) => {
    const points = event?.points;
    if (!points?.length) return;
    const first = points[0];
    const index = first.pointIndex ?? (first.customdata as number | undefined);
    if (typeof index === 'number' && projectedPoints[index]) {
      onSelectPoint(projectedPoints[index]);
    }
  };

  if (projectedPoints.length === 0) return null;

  return (
    <Plot
      data={data}
      layout={layout}
      config={config}
      style={{ width: '100%', height: '100%', minHeight: 400 }}
      useResizeHandler
      onClick={handleClick}
    />
  );
};

export default PlotlyScatterView;
