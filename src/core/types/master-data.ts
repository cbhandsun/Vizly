export interface MasterDataDomain {
  title: string;
  nodes: string[];
  descs: string[];
  ids?: string[];
}

export interface DomainData extends MasterDataDomain {}

export interface MasterDataType {
  [key: string]: MasterDataDomain;
}
