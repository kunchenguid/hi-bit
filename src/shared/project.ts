export type ProjectFile = {
  name: string;
  content: string;
};

export type ProjectFileChangeKind = "changed" | "renamed";

export type ProjectFileChange = {
  kind: ProjectFileChangeKind;
  filename: string;
};
