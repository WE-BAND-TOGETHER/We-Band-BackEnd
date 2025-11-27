declare namespace Express {
  export interface Request {
    user?: {
      user_id: number;
      kakao_id: string;
      email: string;
      user_name: string;
      profile_img: string | null;
    };
  }
}
