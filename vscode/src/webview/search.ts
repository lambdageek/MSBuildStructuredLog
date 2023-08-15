
import { SearchResult, FullyExploredNode } from '../shared/model';
import { NodeMapper } from './node-mapper';

export class SearchController {
    constructor(readonly nodeMapper: NodeMapper) {
    }

    // ensure that the node in the results is fully explored
    summarizeResult(result: SearchResult): Promise<SearchResult<FullyExploredNode>> {
        return this.nodeMapper.fullyExpore(result.nodeId).then((n) => ({ ...result, nodeId: n }));
    }
}

