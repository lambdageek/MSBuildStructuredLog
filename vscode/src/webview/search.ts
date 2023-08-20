
import { Node, SearchResult } from '../shared/model';
import { NodeMapper } from './node-mapper';

export class SearchController {
    constructor(readonly nodeMapper: NodeMapper) {
    }

    // ensure that the node in the results is fully explored
    async summarizeResult(result: SearchResult): Promise<SearchResult<Node>> {
        const node = await this.nodeMapper.fullyExpore(result.nodeId);
        return { ancestors: result.ancestors, nodeId: node };
    }
}

