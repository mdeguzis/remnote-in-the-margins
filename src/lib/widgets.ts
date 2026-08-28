/**
 * Widget file names, which are also the names RemNote is given at registration.
 *
 * One definition, because the name is used in two unrelated places: the index
 * plugin registers it, and three other widgets ask for it to be opened. Two
 * copies of a string like this drift the first time one of them is renamed, and
 * the failure is a sidebar that silently never opens.
 */
export const SIDEBAR_WIDGET = 'comments_sidebar';
