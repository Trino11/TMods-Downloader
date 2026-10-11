import axios from 'axios';
import { MANIFEST_URL } from '../config';

export async function fetchVersions(categoryId) {
    const { data } = await axios.get(MANIFEST_URL);
    return data.versions[categoryId] || [];
}
