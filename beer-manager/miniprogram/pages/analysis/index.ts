import { analysisService, AnalysisPeriod, chartModel } from '../../services/analysisService';
import { errorText } from '../../utils/ui';
Page({ data: { period: 'WEEK' as AnalysisPeriod, offset: 0, summary: analysisService.summary('WEEK'), chart: chartModel(analysisService.summary('WEEK').points, 'MONEY'), chartKind: 'MONEY' as 'MONEY' | 'DELIVERY' | 'BOTTLE', showDaily: false, error: '' }, onShow() { this.refresh(); }, refresh() {
        try {
            const summary = analysisService.summary(this.data.period, this.data.offset);
            this.setData({ summary, chart: chartModel(summary.points, this.data.chartKind), error: '' });
        }
        catch (e) {
            this.setData({ error: errorText(e) });
        }
    }, choose(e: UIEvent) { this.setData({ period: e.currentTarget.dataset.value as AnalysisPeriod, offset: 0 }); this.refresh(); }, shift(e: UIEvent) {
        const offset = this.data.offset + Number(e.currentTarget.dataset.delta);
        if (offset > 0)
            return;
        this.setData({ offset });
        this.refresh();
    }, chooseChart(e: UIEvent) { this.setData({ chartKind: e.currentTarget.dataset.value as 'MONEY' | 'DELIVERY' | 'BOTTLE' }); this.refresh(); }, toggleDaily() { this.setData({ showDaily: !this.data.showDaily }); } });
