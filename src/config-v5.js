import { UNIVERSITIES as V4_UNIVERSITIES } from './config-v4.js';

// 5차에서는 수집값 자체뿐 아니라 2027 모집요강의 정원내 모집인원과도 대조합니다.
// 기존 v4 설정은 그대로 사용하고, 이번에 필요한 두 대학의 기준값만 보강합니다.
export const UNIVERSITIES = V4_UNIVERSITIES.map(u => {
  if (u.name === '한국해양대학교') return { ...u, expectedInnerQuota: 1123 };
  if (u.name === '울산대학교') return { ...u, expectedInnerQuota: 2353 };
  return u;
});
