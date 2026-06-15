export interface MasterDataDomain {
  title: string;
  nodes: string[];
  descs: string[];
  ids?: string[];
}

export type DomainData = MasterDataDomain;

export interface MasterDataType {
  [key: string]: MasterDataDomain;
}
